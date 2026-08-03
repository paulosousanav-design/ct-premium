import { gunzipSync } from 'node:zlib'
import { request as httpsRequest } from 'node:https'

const ENDPOINT_PRODUCAO = 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx'
const SOAP_ACTION = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse'

export type DocumentoDistribuido = {
  nsu: string
  schema: string
  xml: string
  tipo: 'NFE_COMPLETA' | 'RESUMO_NFE' | 'EVENTO' | 'OUTRO'
  chaveAcesso: string
  emitenteCnpj: string
  emitenteNome: string
  dataEmissao: string | null
  valorTotal: number
  situacao: string | null
  evento: string | null
}

export type ResultadoDistribuicao = {
  cStat: string
  motivo: string
  ultimoNsu: string
  maxNsu: string
  documentos: DocumentoDistribuido[]
}

export async function consultarDistribuicaoDfe(input: {
  cnpj: string
  uf: string
  ultimoNsu: string
  pfx: Buffer
  senha: string
  endpoint?: string
}) {
  const cnpj = somenteDigitos(input.cnpj)
  if (cnpj.length !== 14) throw new Error('CNPJ da unidade inválido para consulta de DF-e.')
  const codigoUf = codigoIbgeUf(input.uf)
  if (!codigoUf) throw new Error('UF da unidade inválida para consulta de DF-e.')
  if (!input.pfx.length) throw new Error('Certificado A1 não informado.')

  const ultimoNsu = String(input.ultimoNsu || '0').replace(/\D/g, '').padStart(15, '0').slice(-15)
  const distDfe = `<distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>1</tpAmb><cUFAutor>${codigoUf}</cUFAutor><CNPJ>${cnpj}</CNPJ><distNSU><ultNSU>${ultimoNsu}</ultNSU></distNSU></distDFeInt>`
  const envelope = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg>${distDfe}</nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>`
  const resposta = await requisicaoMtls(input.endpoint || process.env.NFE_DISTRIBUICAO_URL || ENDPOINT_PRODUCAO, envelope, input.pfx, input.senha)
  return interpretarRespostaDistribuicao(resposta)
}

export function interpretarRespostaDistribuicao(xmlSoap: string): ResultadoDistribuicao {
  const retorno = primeiroBloco(xmlSoap, 'retDistDFeInt') || xmlSoap
  const cStat = tag(retorno, 'cStat')
  const motivo = tag(retorno, 'xMotivo')
  const ultimoNsu = tag(retorno, 'ultNSU') || '000000000000000'
  const maxNsu = tag(retorno, 'maxNSU') || ultimoNsu

  if (!cStat) throw new Error('A SEFAZ retornou uma resposta inválida na distribuição de DF-e.')
  if (!['137', '138'].includes(cStat)) {
    if (cStat === '656') throw new Error('SEFAZ: consumo indevido. Aguarde o intervalo indicado antes de consultar novamente.')
    throw new Error(`SEFAZ ${cStat}: ${motivo || 'falha na distribuição de DF-e.'}`)
  }

  const documentos = blocos(retorno, 'docZip').map((bloco) => {
    const nsu = atributo(bloco, 'docZip', 'NSU')
    const schema = atributo(bloco, 'docZip', 'schema')
    const conteudo = textoInterno(bloco, 'docZip').replace(/\s/g, '')
    if (!conteudo) throw new Error(`Documento DF-e ${nsu || '-'} sem conteúdo.`)
    let xml = ''
    try {
      xml = gunzipSync(Buffer.from(conteudo, 'base64')).toString('utf8')
    } catch {
      throw new Error(`Não foi possível descompactar o documento DF-e ${nsu || '-'}.`)
    }
    return analisarDocumento(nsu, schema, xml)
  })

  return { cStat, motivo, ultimoNsu, maxNsu, documentos }
}

function analisarDocumento(nsu: string, schema: string, xml: string): DocumentoDistribuido {
  const schemaNormalizado = schema.toLowerCase()
  if (schemaNormalizado.startsWith('procnfe') || /<(?:\w+:)?nfeProc\b/i.test(xml)) {
    const infNfe = primeiroBloco(xml, 'infNFe')
    const ide = primeiroBloco(infNfe, 'ide')
    const emit = primeiroBloco(infNfe, 'emit')
    const total = primeiroBloco(infNfe, 'ICMSTot')
    return {
      nsu, schema, xml, tipo: 'NFE_COMPLETA',
      chaveAcesso: (atributo(infNfe, 'infNFe', 'Id').replace(/^NFe/i, '') || tag(primeiroBloco(xml, 'infProt'), 'chNFe')),
      emitenteCnpj: tag(emit, 'CNPJ') || tag(emit, 'CPF'),
      emitenteNome: tag(emit, 'xNome') || tag(emit, 'xFant'),
      dataEmissao: tag(ide, 'dhEmi') || tag(ide, 'dEmi') || null,
      valorTotal: numero(tag(total, 'vNF')),
      situacao: tag(primeiroBloco(xml, 'infProt'), 'cStat') || null,
      evento: null,
    }
  }

  if (schemaNormalizado.startsWith('resnfe') || /<(?:\w+:)?resNFe\b/i.test(xml)) {
    return {
      nsu, schema, xml, tipo: 'RESUMO_NFE', chaveAcesso: tag(xml, 'chNFe'),
      emitenteCnpj: tag(xml, 'CNPJ') || tag(xml, 'CPF'), emitenteNome: tag(xml, 'xNome'),
      dataEmissao: tag(xml, 'dhEmi') || null, valorTotal: numero(tag(xml, 'vNF')),
      situacao: tag(xml, 'cSitNFe') || null, evento: null,
    }
  }

  if (schemaNormalizado.includes('evento') || /<(?:\w+:)?procEventoNFe\b/i.test(xml)) {
    return {
      nsu, schema, xml, tipo: 'EVENTO', chaveAcesso: tag(xml, 'chNFe'),
      emitenteCnpj: '', emitenteNome: '', dataEmissao: tag(xml, 'dhEvento') || null,
      valorTotal: 0, situacao: tag(xml, 'cStat') || null,
      evento: tag(xml, 'descEvento') || tag(xml, 'tpEvento') || null,
    }
  }

  return {
    nsu, schema, xml, tipo: 'OUTRO', chaveAcesso: tag(xml, 'chNFe'), emitenteCnpj: '', emitenteNome: '',
    dataEmissao: null, valorTotal: 0, situacao: null, evento: null,
  }
}

function requisicaoMtls(urlTexto: string, corpo: string, pfx: Buffer, senha: string) {
  return new Promise<string>((resolve, reject) => {
    const url = new URL(urlTexto)
    const request = httpsRequest({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port ? Number(url.port) : 443,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      pfx,
      passphrase: senha,
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
      timeout: 60_000,
      headers: {
        'Content-Type': `application/soap+xml; charset=utf-8; action="${SOAP_ACTION}"`,
        'Content-Length': Buffer.byteLength(corpo),
        'User-Agent': 'CT-Premium/1.2',
      },
    }, (response) => {
      const partes: Buffer[] = []
      response.on('data', (parte: Buffer) => partes.push(parte))
      response.on('end', () => {
        const texto = Buffer.concat(partes).toString('utf8')
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`SEFAZ HTTP ${response.statusCode ?? '-'}: ${tag(texto, 'faultstring') || tag(texto, 'Text') || 'falha na consulta.'}`))
          return
        }
        resolve(texto)
      })
    })
    request.on('timeout', () => request.destroy(new Error('A consulta à SEFAZ excedeu 60 segundos.')))
    request.on('error', (error) => reject(traduzirErroCertificado(error)))
    request.end(corpo)
  })
}

function traduzirErroCertificado(error: Error) {
  if (/mac verify failure|bad decrypt|pkcs12|password/i.test(error.message)) return new Error('Certificado A1 ou senha inválidos.')
  if (/certificate has expired/i.test(error.message)) return new Error('O certificado A1 está vencido.')
  return error
}

function codigoIbgeUf(uf: string) {
  return ({ AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53', ES: '32', GO: '52', MA: '21', MT: '51', MS: '50', MG: '31', PA: '15', PB: '25', PR: '41', PE: '26', PI: '22', RJ: '33', RN: '24', RS: '43', RO: '11', RR: '14', SC: '42', SP: '35', SE: '28', TO: '17' } as Record<string, string>)[String(uf || '').trim().toUpperCase()] ?? ''
}

function blocos(xml: string, nome: string) { return xml.match(new RegExp(`<(?:\\w+:)?${nome}\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?${nome}>`, 'gi')) ?? [] }
function primeiroBloco(xml: string, nome: string) { return blocos(xml, nome)[0] ?? '' }
function tag(xml: string, nome: string) { return decodificar(xml.match(new RegExp(`<(?:\\w+:)?${nome}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${nome}>`, 'i'))?.[1] ?? '').trim() }
function atributo(xml: string, elemento: string, nome: string) { return decodificar(xml.match(new RegExp(`<(?:\\w+:)?${elemento}\\b[^>]*\\b${nome}=["']([^"']+)["']`, 'i'))?.[1] ?? '').trim() }
function textoInterno(xml: string, nome: string) { return xml.match(new RegExp(`<(?:\\w+:)?${nome}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${nome}>`, 'i'))?.[1] ?? '' }
function decodificar(valor: string) { return valor.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))) }
function numero(valor: unknown) { const parsed = Number(String(valor ?? '0').replace(',', '.')); return Number.isFinite(parsed) ? parsed : 0 }
function somenteDigitos(valor: unknown) { return String(valor ?? '').replace(/\D/g, '') }
