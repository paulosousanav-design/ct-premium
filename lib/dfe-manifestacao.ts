import forge from 'node-forge'
import { request as httpsRequest } from 'node:https'
import * as tls from 'node:tls'
import { SignedXml } from 'xml-crypto'

const ENDPOINTS_POR_UF: Record<string, string> = { MS: 'https://nfe.sefaz.ms.gov.br/ws/NFeRecepcaoEvento4' }
const SOAP_ACTION = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEventoNF'

type EntradaManifestacao = { cnpj: string; uf: string; chaveAcesso: string; pfx: Buffer; senha: string }

export async function manifestarCienciaDaOperacao(entrada: EntradaManifestacao) {
  const cnpj = somenteDigitos(entrada.cnpj)
  const chave = somenteDigitos(entrada.chaveAcesso)
  if (cnpj.length !== 14) throw new Error('CNPJ da unidade inválido para manifestação.')
  if (chave.length !== 44) throw new Error('A chave de acesso da NF-e é inválida.')
  const { chavePrivada, certificado } = extrairCredenciais(entrada.pfx, entrada.senha)
  const idEvento = `ID210210${chave}01`
  const evento = `<evento versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe"><infEvento Id="${idEvento}"><cOrgao>91</cOrgao><tpAmb>1</tpAmb><CNPJ>${cnpj}</CNPJ><chNFe>${chave}</chNFe><dhEvento>${dataEvento()}</dhEvento><tpEvento>210210</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Ciencia da Operacao</descEvento></detEvento></infEvento></evento>`
  const xmlAssinado = assinarEvento(evento, chavePrivada, certificado)
  const idLote = String(Date.now()).slice(-15).padStart(15, '0')
  const corpo = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4"><envEvento versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe"><idLote>${idLote}</idLote>${xmlAssinado}</envEvento></nfeDadosMsg></soap12:Body></soap12:Envelope>`
  const endpoint = process.env.NFE_RECEPCAO_EVENTO_URL || ENDPOINTS_POR_UF[String(entrada.uf).trim().toUpperCase()]
  if (!endpoint) throw new Error('O endpoint de manifestação desta UF não está configurado.')
  const resposta = await requisicaoMtls(endpoint, corpo, entrada.pfx, entrada.senha)
  const codigo = tag(primeiroBloco(resposta, 'retEvento'), 'cStat') || tag(resposta, 'cStat')
  const motivo = tag(primeiroBloco(resposta, 'retEvento'), 'xMotivo') || tag(resposta, 'xMotivo')
  if (!['135', '136'].includes(codigo)) throw new Error(`SEFAZ ${codigo || '-'}: ${motivo || 'manifestação não aceita.'}`)
  return { codigo, motivo: motivo || 'Ciência da operação registrada.' }
}

function assinarEvento(xml: string, chavePrivada: string, certificado: string) {
  const assinatura = new SignedXml({ privateKey: chavePrivada, publicCert: certificado })
  assinatura.addReference({ xpath: "//*[local-name(.)='infEvento']", transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'], digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1' })
  assinatura.canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
  assinatura.signatureAlgorithm = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1'
  assinatura.computeSignature(xml)
  return assinatura.getSignedXml()
}

function extrairCredenciais(pfx: Buffer, senha: string) {
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')))
    const arquivo = forge.pkcs12.pkcs12FromAsn1(asn1, senha)
    const chaves = arquivo.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []
    const certificados = arquivo.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []
    const chave = chaves.find((item) => item.key)?.key
    const certificado = certificados.find((item) => item.cert)?.cert
    if (!chave || !certificado) throw new Error('Certificado sem chave privada.')
    return { chavePrivada: forge.pki.privateKeyToPem(chave), certificado: forge.pki.certificateToPem(certificado) }
  } catch { throw new Error('Não foi possível usar o certificado A1 para assinar a manifestação.') }
}

function requisicaoMtls(urlTexto: string, corpo: string, pfx: Buffer, senha: string) {
  return new Promise<string>((resolve, reject) => {
    const url = new URL(urlTexto)
    const certificadosDoSistema = (tls as unknown as { getCACertificates?: (tipo: 'system') => string[] }).getCACertificates?.('system')
    const request = httpsRequest({ protocol: url.protocol, hostname: url.hostname, port: url.port ? Number(url.port) : 443, path: `${url.pathname}${url.search}`, method: 'POST', pfx, passphrase: senha, ca: certificadosDoSistema?.length ? certificadosDoSistema : undefined, minVersion: 'TLSv1.2', rejectUnauthorized: true, timeout: 60_000, headers: { 'Content-Type': `application/soap+xml; charset=utf-8; action="${SOAP_ACTION}"`, 'Content-Length': Buffer.byteLength(corpo), 'User-Agent': 'CT-Premium/1.2' } }, (response) => {
      const partes: Buffer[] = []
      response.on('data', (parte: Buffer) => partes.push(parte))
      response.on('end', () => { const texto = Buffer.concat(partes).toString('utf8'); if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`SEFAZ HTTP ${response.statusCode ?? '-'}: ${tag(texto, 'faultstring') || tag(texto, 'Text') || 'falha na manifestação.'}`)); resolve(texto) })
    })
    request.on('timeout', () => request.destroy(new Error('A manifestação na SEFAZ excedeu 60 segundos.')))
    request.on('error', reject)
    request.end(corpo)
  })
}

function dataEvento() { const partes = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).reduce<Record<string, string>>((resultado, parte) => ({ ...resultado, [parte.type]: parte.value }), {}); return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}-04:00` }
function primeiroBloco(xml: string, nome: string) { return xml.match(new RegExp(`<(?:\\w+:)?${nome}\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?${nome}>`, 'i'))?.[0] ?? '' }
function tag(xml: string, nome: string) { return (xml.match(new RegExp(`<(?:\\w+:)?${nome}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${nome}>`, 'i'))?.[1] ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').trim() }
function somenteDigitos(valor: unknown) { return String(valor ?? '').replace(/\\D/g, '') }
