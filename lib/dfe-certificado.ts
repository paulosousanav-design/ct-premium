import forge from 'node-forge'
import { createSecureContext } from 'node:tls'

export function normalizarPfxParaServidor(pfx: Buffer, senha: string) {
  if (pfxAceitoPeloServidor(pfx, senha)) return pfx
  return reempacotarPfx(pfx, senha)
}

export function reempacotarPfx(pfx: Buffer, senha: string) {
  const aberto = abrirPfx(pfx, senha)
  const moderno = Buffer.from(
    forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(aberto.chave, aberto.certificados, senha, {
      algorithm: 'aes256',
      count: 10000,
      saltSize: 16,
      useMac: true,
      friendlyName: 'CT Premium A1',
    })).getBytes(),
    'binary',
  )

  if (!pfxAceitoPeloServidor(moderno, senha)) throw new Error('PFX_INVALIDO')
  return moderno
}

function pfxAceitoPeloServidor(pfx: Buffer, senha: string) {
  try {
    createSecureContext({ pfx, passphrase: senha, minVersion: 'TLSv1.2' })
    return true
  } catch (error) {
    const detalhe = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    if (/mac verify|password|passphrase/i.test(detalhe) && !/unsupported|algorithm|cipher|envelope/i.test(detalhe)) {
      throw new Error('SENHA_INVALIDA')
    }
    return false
  }
}

function abrirPfx(pfx: Buffer, senha: string) {
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')))
    const arquivo = forge.pkcs12.pkcs12FromAsn1(asn1, senha)
    const chaves = arquivo.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []
    const bags = arquivo.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []
    const chave = chaves.find((item) => item.key)?.key
    const certificados = bags.flatMap((item) => item.cert ? [item.cert] : [])
    if (!chave || certificados.length === 0) throw new Error('PFX_INVALIDO')
    return { chave, certificados }
  } catch (error) {
    if (error instanceof Error && error.message === 'PFX_INVALIDO') throw error
    const detalhe = error instanceof Error ? error.message : String(error)
    if (/invalid password|mac|pkcs#12/i.test(detalhe)) throw new Error('SENHA_INVALIDA')
    throw new Error('PFX_INVALIDO')
  }
}
