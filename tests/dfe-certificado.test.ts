import assert from 'node:assert/strict'
import test from 'node:test'
import forge from 'node-forge'
import { createSecureContext } from 'node:tls'
import { normalizarPfxParaServidor, reempacotarPfx } from '../lib/dfe-certificado.ts'

test('reempacota um PFX antigo para um formato que o servidor abre', () => {
  const senha = 'senha-de-teste'
  const antigo = gerarPfx(senha, '3des')
  const moderno = reempacotarPfx(antigo, senha)

  assert.equal(servidorAbre(moderno, senha), true)
  assert.equal(normalizarPfxParaServidor(moderno, senha).equals(moderno), true)
})

test('mantém o PFX quando o servidor já consegue abrir', () => {
  const senha = 'senha-de-teste'
  const moderno = gerarPfx(senha, 'aes256')
  assert.equal(normalizarPfxParaServidor(moderno, senha).equals(moderno), true)
})

test('recusa a senha errada', () => {
  const antigo = gerarPfx('senha-certa', '3des')
  assert.throws(() => normalizarPfxParaServidor(antigo, 'senha-errada'), /SENHA_INVALIDA/)
})

function gerarPfx(senha: string, algorithm: '3des' | 'aes256') {
  const chaves = forge.pki.rsa.generateKeyPair(2048)
  const certificado = forge.pki.createCertificate()
  certificado.publicKey = chaves.publicKey
  certificado.serialNumber = '01'
  certificado.validity.notBefore = new Date()
  certificado.validity.notAfter = new Date(Date.now() + 86400000)
  certificado.setSubject([{ name: 'commonName', value: 'Teste A1' }])
  certificado.setIssuer([{ name: 'commonName', value: 'Teste A1' }])
  certificado.sign(chaves.privateKey, forge.md.sha256.create())
  const der = forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(chaves.privateKey, [certificado], senha, { algorithm })).getBytes()
  return Buffer.from(der, 'binary')
}

function servidorAbre(pfx: Buffer, senha: string) {
  try {
    createSecureContext({ pfx, passphrase: senha, minVersion: 'TLSv1.2' })
    return true
  } catch {
    return false
  }
}
