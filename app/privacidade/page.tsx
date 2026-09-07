import type { Metadata } from 'next'
import { PaginaLegal } from '@/components/pagina-legal'

export const metadata: Metadata = {
  title: 'Política de Privacidade | Chame o Técnico',
  description: 'Como o Chame o Técnico trata dados pessoais e dados usados pela integração com o Google Drive.',
}

export default function PrivacidadePage() {
  return (
    <PaginaLegal titulo="Política de Privacidade" resumo="Esta política explica como o Chame o Técnico trata dados pessoais e, em especial, os dados usados pela integração de backup com o Google Drive.">
      <section>
        <h2>1. Responsável pelo tratamento</h2>
        <p>O Chame o Técnico é responsável pelo tratamento dos dados descritos nesta política. Dúvidas, solicitações de acesso, correção ou exclusão podem ser enviadas para <a href="mailto:atendimento@chameotecnico.com.br">atendimento@chameotecnico.com.br</a>.</p>
      </section>

      <section>
        <h2>2. Dados tratados pelo sistema</h2>
        <p>Conforme a funcionalidade utilizada, o sistema pode tratar dados de clientes, técnicos, parceiros, ordens de serviço, documentos, registros financeiros, fotos, dados de contato e registros técnicos de segurança e auditoria.</p>
        <p>Esses dados são usados para prestar e administrar os serviços solicitados, manter o histórico operacional, cumprir obrigações aplicáveis, proteger o sistema e permitir a recuperação das informações em caso de incidente.</p>
      </section>

      <section>
        <h2>3. Integração com o Google Drive</h2>
        <p>A integração usa a permissão <code>drive.file</code>, limitada aos arquivos e pastas que o próprio Chame o Técnico cria ou utiliza por meio da integração. Ela não concede acesso geral a todos os arquivos pessoais existentes no Google Drive.</p>
        <p>Com autorização expressa de um administrador, o sistema:</p>
        <ul>
          <li>consulta o nome e o e-mail da conta Google conectada;</li>
          <li>cria pastas destinadas aos backups;</li>
          <li>cria e atualiza arquivos de backup do banco, fotos e documentos;</li>
          <li>lista os arquivos de backup criados pela integração;</li>
          <li>remove backups antigos conforme o prazo de retenção configurado.</li>
        </ul>
        <p>Os dados obtidos pelas APIs do Google são usados somente para executar, verificar, manter e proteger a rotina de backup solicitada. Não vendemos dados do Google, não os utilizamos para publicidade e não os compartilhamos com terceiros para finalidades independentes.</p>
      </section>

      <section>
        <h2>4. Credenciais, armazenamento e segurança</h2>
        <p>A autorização de acesso ao Google Drive é armazenada de forma criptografada e processada somente no servidor. Aplicamos controles de acesso administrativo, registros de auditoria e verificações de integridade SHA-256 aos arquivos de backup.</p>
        <p>Fornecedores de infraestrutura, como Google, Supabase e Vercel, podem processar dados estritamente para disponibilizar os serviços contratados, sujeitos aos seus próprios compromissos de segurança e privacidade.</p>
      </section>

      <section>
        <h2>5. Retenção e exclusão</h2>
        <p>Os backups do banco permanecem no Google Drive pelo prazo configurado pelo administrador. Fotos e documentos podem ser mantidos como cópia incremental enquanto forem necessários à recuperação do sistema ou ao cumprimento de obrigações aplicáveis.</p>
        <p>O administrador pode desconectar a integração na Central de Backups e também revogar o acesso na Conta do Google. A desconexão interrompe novos acessos; arquivos já gravados no Drive são preservados para evitar perda acidental e podem ser excluídos pelo titular diretamente no Google Drive.</p>
      </section>

      <section>
        <h2>6. Direitos e contato</h2>
        <p>O titular pode solicitar informações sobre o tratamento, acesso, correção, portabilidade ou exclusão, quando aplicável, bem como revogar consentimentos. Para exercer esses direitos, entre em contato pelo e-mail <a href="mailto:atendimento@chameotecnico.com.br">atendimento@chameotecnico.com.br</a>.</p>
      </section>

      <section>
        <h2>7. Alterações desta política</h2>
        <p>Esta política poderá ser atualizada para refletir mudanças legais, operacionais ou de segurança. A versão vigente e sua data de atualização permanecerão disponíveis nesta página.</p>
      </section>
    </PaginaLegal>
  )
}
