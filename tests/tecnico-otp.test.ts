import assert from 'node:assert/strict'
import test from 'node:test'
import {
  codigoTecnicoValido,
  expiracaoCodigoTecnico,
  gerarCodigoTecnico,
  hashCodigoTecnico,
  telefoneWhatsAppInternacional,
} from '../lib/tecnico-otp.ts'
import { montarMensagemOtp } from '../lib/whatsapp-cloud.ts'
import { telefonesCorrespondem } from '../lib/tecnico-auth.ts'

process.env.TECNICO_OTP_SECRET = 'segredo-de-teste-com-tamanho-suficiente'

test('gera codigo numerico de seis digitos', () => {
  assert.match(gerarCodigoTecnico(), /^\d{6}$/)
})

test('valida o codigo somente para o tecnico correto', () => {
  const hash = hashCodigoTecnico('123456', 42)
  assert.equal(codigoTecnicoValido('123456', 42, hash), true)
  assert.equal(codigoTecnicoValido('654321', 42, hash), false)
  assert.equal(codigoTecnicoValido('123456', 43, hash), false)
})

test('define validade de cinco minutos e normaliza telefone brasileiro', () => {
  assert.equal(expiracaoCodigoTecnico(1_000).getTime(), 301_000)
  assert.equal(telefoneWhatsAppInternacional('(67) 99999-1234'), '5567999991234')
  assert.equal(telefoneWhatsAppInternacional('+55 67 99999-1234'), '5567999991234')
})

test('compara telefone local com DDI sem aceitar numeros incompletos', () => {
  assert.equal(telefonesCorrespondem('(67) 99999-1234', '5567999991234'), true)
  assert.equal(telefonesCorrespondem('', '5567999991234'), false)
  assert.equal(telefonesCorrespondem('91234', '5567999991234'), false)
})

test('monta template oficial com codigo no corpo e botao de copia', () => {
  const mensagem = montarMensagemOtp({
    telefone: '5567999991234',
    codigo: '123456',
    templateName: 'codigo_acesso_tecnico',
    languageCode: 'pt_BR',
  })
  assert.equal(mensagem.template.components[0].parameters[0].text, '123456')
  assert.equal(mensagem.template.components[1].parameters[0].text, '123456')
  assert.equal(mensagem.template.components[1].sub_type, 'url')
})
