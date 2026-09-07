import forge from 'node-forge'
import { request as httpsRequest } from 'node:https'
import * as tls from 'node:tls'
import { SignedXml } from 'xml-crypto'

// A manifestação do destinatário (2102xx) é registrada no Ambiente Nacional.
// O endpoint estadual rejeita esse tpEvento com cStat 491.
const ENDPOINT_AMBIENTE_NACIONAL = 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx'
const SOAP_ACTION = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEventoNF'
// A cadeia ICP-Brasil v10 é apresentada pela SEFAZ-MS, mas não está no armazenamento
// padrão de todas as plataformas de hospedagem. Mantemos rejectUnauthorized ativo.
const CA_RAIZ_ICP_BRASIL_V10 = `-----BEGIN CERTIFICATE-----
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
-----END CERTIFICATE-----`

type EntradaManifestacao = { cnpj: string; uf: string; chaveAcesso: string; pfx: Buffer; senha: string }
const CA_RAIZ_ICP_BRASIL_V10_VALIDADA = `
-----BEGIN CERTIFICATE-----
MIIGrDCCBJSgAwIBAgIJANLVi0S/gZNCMA0GCSqGSIb3DQEBDQUAMIGYMQswCQYD
VQQGEwJCUjETMBEGA1UECgwKSUNQLUJyYXNpbDE9MDsGA1UECww0SW5zdGl0dXRv
IE5hY2lvbmFsIGRlIFRlY25vbG9naWEgZGEgSW5mb3JtYWNhbyAtIElUSTE1MDMG
A1UEAwwsQXV0b3JpZGFkZSBDZXJ0aWZpY2Fkb3JhIFJhaXogQnJhc2lsZWlyYSB2
MTAwHhcNMTkwNzAxMTkxNTU5WhcNMzIwNzAxMTIwMDU5WjCBmDELMAkGA1UEBhMC
QlIxEzARBgNVBAoMCklDUC1CcmFzaWwxPTA7BgNVBAsMNEluc3RpdHV0byBOYWNp
b25hbCBkZSBUZWNub2xvZ2lhIGRhIEluZm9ybWFjYW8gLSBJVEkxNTAzBgNVBAMM
LEF1dG9yaWRhZGUgQ2VydGlmaWNhZG9yYSBSYWl6IEJyYXNpbGVpcmEgdjEwMIIC
IjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAk3AxKl1ZtP0pNyjChqO7qNkn
+/sClZeqiV/Kd7KnnbkDbI2y3VWcUG7feCE/deIxot6GH6JXncRG794UZl+4doD0
D0/cEwBd4DvrDSZm0RT40xhmYYOTxZDJxv+coTHdmsT5aNmSkktfjzYX4HQHh/7M
em+kTOpT/3E4K6B7KVs9HkOT7nXx5yU1qYbVWqI0qpJM9mOTSFx8C9HiKcHvLCvt
1ioXKPAmFuHPkayOcXP2MXeb+VRNjWKU4E+L2t5uZPKVx1M/9i1DztlLb4K8OfYg
GaPDUSF1sxnoGk5qZHLleO6KjCpmuQepmgsBvxi2YNO7X2YUwQQx1AXNSolgtkAR
5gt+1WzxhbFUhItQqlhqxgWHefLmiT5T/Ctz/P2v+zSO4efkkIzsi1iwD+ypZvM2
lnIvB24RcSN6jzmCahLPX4CwjwIK6JsSoMVxIhpZHCguUP4LXqP8IWUZ6WgS/4zB
7B9E0EICl2rM1PRy+6ulv+ZOW256e8a0pijUB+hXM1msUq9L92476FAAX8va3sP7
+Uut94+bGHmubcTLImWUPrxNT7QyrvE3FyHicfiHioeFL2oV4cXTLZrEq2wS8R4P
KPdSzNn5Z9e2uMEGYQaSNO+OwvVycpIhOBOqrm12wJ9ZhWKtM5UOo34/o37r5ZBI
TYXAGbhqQDB9mWXwH+0CAwEAAaOB9jCB8zBOBgNVHSAERzBFMEMGBWBMAQEAMDow
OAYIKwYBBQUHAgEWLGh0dHA6Ly9hY3JhaXouaWNwYnJhc2lsLmdvdi5ici9EUENh
Y3JhaXoucGRmMEAGA1UdHwQ5MDcwNaAzoDGGL2h0dHA6Ly9hY3JhaXouaWNwYnJh
c2lsLmdvdi5ici9MQ1JhY3JhaXp2MTAuY3JsMB8GA1UdIwQYMBaAFHTzfv/8n1N6
8Xzrqz6kptoYukVjMB0GA1UdDgQWBBR0837//J9TevF866s+pKbaGLpFYzAPBgNV
HRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBBjANBgkqhkiG9w0BAQ0FAAOCAgEA
eCNhBSuy/Ih/T+1VOtAJju85SrtoE3vET1qXASpmjQllDHG/ph7VFNRAkC+gha+B
CbjoA5oJ/8wwl+Qdp1KGz6nXXFTLx3osU+kjm0srmBf9nyXHPqvFyvBeB0A7sYb7
TmII9GKD20oCxsdkccR/oE/JuTaNnGq0GYZ2aDb5v62uLi21Y6P9UBiTxZqQ4ojW
ET6kXNjlK238jpXv17FR8Sg3VusCvX7Q8eJkavvHHZDeWck2fSA+ycAc2JeL2Z0B
MSxGWpH32WM9J8+6XqCJUXHiWEV0zCE8wDYiYC+047pTxQI/gB/FcU7jvylh98DJ
kQPHd/Tp6Og3ynlDA9n9uBbxYHVRZs9vsZ/7xTFaxRe+zk8dhgKgZ/3RrcMFB570
2t8LFbyuUE/kQVY6rZ0QJ9qMWQ7VPLRwRhiMeU3k8WDJb/tBbOXHBqldTbWyQ+mp
MEDWhbrzE/IED82wAuO23Tb05cYk2xC7+Izef8fSc3XdJDuPSbcDpWukzyCDtSEH
isLiGEtIbYRiPsF3czlQPsnIEVoTTCWxHCH1zYR6zScSv18Qh69qVe2J40K5jZoP
GEOhq/oKhVJQAdvAFW5Odp7mF3Tk9nivjjsctJSxY26LFiV5GRV+07SSse4ti0aO
jO5PLg5SWjfcOtBG2rz02EIvQAmLcb0kGBtfdj0lW/w=
-----END CERTIFICATE-----
`

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
  const endpoint = process.env.NFE_RECEPCAO_EVENTO_URL || ENDPOINT_AMBIENTE_NACIONAL
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
    const certificadosDoSistema = (tls as unknown as { getCACertificates?: (tipo: 'system') => string[] }).getCACertificates?.('system') ?? []
    const request = httpsRequest({ protocol: url.protocol, hostname: url.hostname, port: url.port ? Number(url.port) : 443, path: `${url.pathname}${url.search}`, method: 'POST', pfx, passphrase: senha, ca: [...tls.rootCertificates, ...certificadosDoSistema, CA_RAIZ_ICP_BRASIL_V10_VALIDADA], minVersion: 'TLSv1.2', rejectUnauthorized: true, timeout: 60_000, headers: { 'Content-Type': `application/soap+xml; charset=utf-8; action="${SOAP_ACTION}"`, 'Content-Length': Buffer.byteLength(corpo), 'User-Agent': 'CT-Premium/1.2' } }, (response) => {
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
