import type { Metadata } from 'next'
import { PaginaLegal } from '@/components/pagina-legal'

export const metadata: Metadata = {
  title: 'Termos de Serviço | Chame o Técnico',
  description: 'Condições de uso do sistema Chame o Técnico e da integração de backup com o Google Drive.',
}

export default function TermosPage() {
  return (
    <PaginaLegal titulo="Termos de Serviço" resumo="Estes termos estabelecem as condições de uso do Chame o Técnico e da integração de backup com o Google Drive.">
      <section>
        <h2>1. Aceitação</h2>
        <p>Ao utilizar o sistema, o usuário declara possuir autorização para operar os dados inseridos e concorda com estes termos e com a Política de Privacidade.</p>
      </section>

      <section>
        <h2>2. Finalidade do serviço</h2>
        <p>O Chame o Técnico oferece recursos de gestão de atendimentos, clientes, técnicos, ordens de serviço, documentos, estoque, operações financeiras e cópias de segurança. As funcionalidades disponíveis podem evoluir ao longo do tempo.</p>
      </section>

      <section>
        <h2>3. Contas e responsabilidades</h2>
        <p>Cada usuário deve proteger suas credenciais, utilizar somente as permissões concedidas e informar imediatamente qualquer suspeita de acesso indevido. Administradores são responsáveis por configurar usuários, retenção, integrações e rotinas operacionais de sua organização.</p>
      </section>

      <section>
        <h2>4. Backup no Google Drive</h2>
        <p>A integração é opcional e deve ser autorizada por um administrador. Ela cria arquivos de backup no Google Drive conectado e pode excluir cópias antigas segundo a retenção configurada.</p>
        <p>O administrador pode revogar o acesso a qualquer momento na Central de Backups ou na Conta do Google. A desconexão não exclui automaticamente os arquivos já existentes, que permanecem sob controle do titular da conta Google.</p>
      </section>

      <section>
        <h2>5. Uso adequado</h2>
        <p>É proibido utilizar o serviço para acesso não autorizado, fraude, violação de direitos, distribuição de conteúdo ilícito ou tentativa de comprometer a segurança e a disponibilidade do sistema ou de terceiros.</p>
      </section>

      <section>
        <h2>6. Disponibilidade e recuperação</h2>
        <p>São adotadas medidas razoáveis para manter o serviço disponível e preservar a integridade dos backups. Ainda assim, nenhuma tecnologia elimina completamente riscos de indisponibilidade, falha de terceiros ou perda de dados. O administrador deve acompanhar os alertas da Central de Backups e manter cópias adicionais quando necessário.</p>
      </section>

      <section>
        <h2>7. Privacidade</h2>
        <p>O tratamento de dados pessoais e de dados do Google é descrito na <a href="/privacidade">Política de Privacidade</a>, que integra estes termos.</p>
      </section>

      <section>
        <h2>8. Contato e alterações</h2>
        <p>Dúvidas podem ser enviadas para <a href="mailto:atendimento@chameotecnico.com.br">atendimento@chameotecnico.com.br</a>. Estes termos poderão ser atualizados, com a versão vigente e sua data publicadas nesta página.</p>
      </section>
    </PaginaLegal>
  )
}
