import assert from 'node:assert/strict'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import { interpretarRespostaDistribuicao } from '../lib/dfe-sefaz.ts'

function docZip(nsu: string, schema: string, xml: string) {
  return `<docZip NSU="${nsu}" schema="${schema}">${gzipSync(Buffer.from(xml)).toString('base64')}</docZip>`
}

function resposta(documentos: string, cStat = '138') {
  return `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>1</tpAmb><verAplic>1.7</verAplic><cStat>${cStat}</cStat><xMotivo>Documentos localizados</xMotivo><dhResp>2026-08-02T10:00:00-04:00</dhResp><ultNSU>000000000000002</ultNSU><maxNSU>000000000000002</maxNSU><loteDistDFeInt>${documentos}</loteDistDFeInt></retDistDFeInt></soap:Body></soap:Envelope>`
}

test('interpreta resumo e XML completo distribuídos pela SEFAZ', () => {
  const resumo = `<resNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><chNFe>50260812345678000190550010000000011000000010</chNFe><CNPJ>12345678000190</CNPJ><xNome>Fornecedor Teste</xNome><dhEmi>2026-08-01T09:00:00-04:00</dhEmi><vNF>1250.45</vNF><cSitNFe>1</cSitNFe></resNFe>`
  const completa = `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe50260898765432000110550010000000021000000020"><ide><dhEmi>2026-08-02T08:30:00-04:00</dhEmi></ide><emit><CNPJ>98765432000110</CNPJ><xNome>Industria Teste</xNome></emit><total><ICMSTot><vNF>987.60</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><cStat>100</cStat></infProt></protNFe></nfeProc>`
  const resultado = interpretarRespostaDistribuicao(resposta(
    docZip('000000000000001', 'resNFe_v1.01.xsd', resumo) +
    docZip('000000000000002', 'procNFe_v4.00.xsd', completa),
  ))

  assert.equal(resultado.documentos.length, 2)
  assert.deepEqual(resultado.documentos[0], {
    nsu: '000000000000001',
    schema: 'resNFe_v1.01.xsd',
    xml: resumo,
    tipo: 'RESUMO_NFE',
    chaveAcesso: '50260812345678000190550010000000011000000010',
    emitenteCnpj: '12345678000190',
    emitenteNome: 'Fornecedor Teste',
    dataEmissao: '2026-08-01T09:00:00-04:00',
    valorTotal: 1250.45,
    situacao: '1',
    evento: null,
  })
  assert.equal(resultado.documentos[1].tipo, 'NFE_COMPLETA')
  assert.equal(resultado.documentos[1].chaveAcesso, '50260898765432000110550010000000021000000020')
  assert.equal(resultado.documentos[1].valorTotal, 987.6)
})

test('bloqueia nova consulta quando a SEFAZ informa consumo indevido', () => {
  assert.throws(
    () => interpretarRespostaDistribuicao(resposta('', '656')),
    /consumo indevido/i,
  )
})
