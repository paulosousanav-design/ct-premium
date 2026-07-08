from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "manual-sistema-chame-o-tecnico.pdf"
LOGO = ROOT / "public" / "logo-chame-o-tecnico.png"
LOGO_CT = ROOT / "public" / "logo-ct.png"

ORANGE = colors.HexColor("#ff6b00")
NAVY = colors.HexColor("#071126")
SLATE = colors.HexColor("#475569")
LIGHT = colors.HexColor("#f8fafc")
BORDER = colors.HexColor("#dbe3ea")


def make_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            "CoverTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=30,
            leading=36,
            alignment=TA_CENTER,
            textColor=NAVY,
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            "CoverSubtitle",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=13,
            leading=19,
            alignment=TA_CENTER,
            textColor=SLATE,
        )
    )
    styles.add(
        ParagraphStyle(
            "SectionTitle",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=23,
            textColor=NAVY,
            spaceBefore=8,
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            "SubTitle",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12.5,
            leading=16,
            textColor=NAVY,
            spaceBefore=8,
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            "Body",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9.6,
            leading=14.5,
            textColor=colors.HexColor("#1f2937"),
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            "Small",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8.2,
            leading=11.5,
            textColor=SLATE,
        )
    )
    styles.add(
        ParagraphStyle(
            "Note",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=13,
            textColor=NAVY,
            backColor=colors.HexColor("#fff7ed"),
            borderColor=colors.HexColor("#fed7aa"),
            borderWidth=0.75,
            borderPadding=8,
            spaceBefore=4,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            "Callout",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9.2,
            leading=13.5,
            textColor=colors.white,
            backColor=NAVY,
            borderPadding=8,
            spaceBefore=4,
            spaceAfter=8,
        )
    )
    return styles


def header_footer(canvas, doc):
    canvas.saveState()
    width, height = A4

    canvas.setFillColor(NAVY)
    canvas.rect(0, height - 1.05 * cm, width, 1.05 * cm, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 8.5)
    canvas.drawString(1.5 * cm, height - 0.66 * cm, "Manual do Sistema Chame o Tecnico")

    canvas.setFillColor(ORANGE)
    canvas.rect(0, height - 1.05 * cm, 0.55 * cm, 1.05 * cm, stroke=0, fill=1)

    canvas.setStrokeColor(BORDER)
    canvas.line(1.5 * cm, 1.25 * cm, width - 1.5 * cm, 1.25 * cm)
    canvas.setFillColor(SLATE)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(1.5 * cm, 0.78 * cm, "Uso interno - Atendimento, administracao e operacao")
    canvas.drawRightString(width - 1.5 * cm, 0.78 * cm, f"Pagina {doc.page}")
    canvas.restoreState()


def cover(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(LIGHT)
    canvas.rect(0, 0, width, height, stroke=0, fill=1)
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, width, 5.2 * cm, stroke=0, fill=1)
    canvas.setFillColor(ORANGE)
    canvas.rect(0, 5.2 * cm, width, 0.28 * cm, stroke=0, fill=1)
    canvas.restoreState()


def p(text, styles):
    return Paragraph(text, styles["Body"])


def note(text, styles):
    return Paragraph(text, styles["Note"])


def callout(text, styles):
    return Paragraph(text, styles["Callout"])


def bullets(items, styles):
    return ListFlowable(
        [ListItem(Paragraph(item, styles["Body"]), leftIndent=10) for item in items],
        bulletType="bullet",
        start="circle",
        leftIndent=16,
        bulletFontName="Helvetica-Bold",
        bulletFontSize=7,
    )


def section(title, children, styles):
    return [Paragraph(title, styles["SectionTitle"]), *children, Spacer(1, 8)]


def table(rows, widths):
    header_style = ParagraphStyle(
        "TableHeader",
        fontName="Helvetica-Bold",
        fontSize=8.4,
        leading=11,
        textColor=colors.white,
    )
    cell_style = ParagraphStyle(
        "TableCell",
        fontName="Helvetica",
        fontSize=8.4,
        leading=11,
        textColor=colors.HexColor("#1f2937"),
    )
    converted = []
    for row_index, row in enumerate(rows):
        style = header_style if row_index == 0 else cell_style
        converted.append([Paragraph(str(cell), style) for cell in row])

    t = Table(converted, colWidths=widths, hAlign="LEFT")
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.4),
                ("LEADING", (0, 0), (-1, -1), 11),
                ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#1f2937")),
                ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return t


def build_manual():
    styles = make_styles()
    OUT.parent.mkdir(parents=True, exist_ok=True)

    doc = BaseDocTemplate(
        str(OUT),
        pagesize=A4,
        rightMargin=1.55 * cm,
        leftMargin=1.55 * cm,
        topMargin=1.75 * cm,
        bottomMargin=1.55 * cm,
        title="Manual do Sistema Chame o Tecnico",
        author="Chame o Tecnico",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates(
        [
            PageTemplate(id="cover", frames=frame, onPage=cover),
            PageTemplate(id="main", frames=frame, onPage=header_footer),
        ]
    )

    story = []
    story.append(Spacer(1, 2.1 * cm))
    if LOGO.exists():
        story.append(Image(str(LOGO), width=7.7 * cm, height=2.05 * cm, hAlign="CENTER"))
        story.append(Spacer(1, 0.8 * cm))
    story.append(Paragraph("Manual Operacional do Sistema", styles["CoverTitle"]))
    story.append(
        Paragraph(
            "Chame o Tecnico - guia pratico para administrar chamados, clientes, tecnicos, financeiro, configuracoes e backup.",
            styles["CoverSubtitle"],
        )
    )
    story.append(Spacer(1, 6.8 * cm))
    story.append(
        table(
            [
                ["Versao", "Uso", "Atualizacao"],
                ["1.0", "Operacao interna e treinamento", "Julho/2026"],
            ],
            [4 * cm, 6 * cm, 5 * cm],
        )
    )
    story.append(NextPageTemplate("main"))
    story.append(PageBreak())
    story.append(Paragraph("Sumario", styles["SectionTitle"]))
    sumario = [
        ["1", "Visao geral do sistema", "3"],
        ["2", "Acesso, usuarios e permissoes", "4"],
        ["3", "Abertura de chamados e atendimento em MS", "5"],
        ["4", "Clientes", "6"],
        ["5", "Ordens de servico", "7"],
        ["6", "Tecnicos e agenda", "8"],
        ["7", "Financeiro, pecas e relatorios", "9"],
        ["8", "Configuracoes e backup", "10"],
        ["9", "Rotina recomendada", "11"],
        ["10", "Suporte e proximos passos", "12"],
    ]
    story.append(table([["Secao", "Conteudo", "Pagina"], *sumario], [2.5 * cm, 10.2 * cm, 2.2 * cm]))
    story.append(Spacer(1, 12))
    story.append(note("Este manual foi criado para uso pratico. Ele nao substitui backup oficial do Supabase, mas orienta a operacao diaria e o uso do backup manual do painel.", styles))
    story.append(PageBreak())

    story.extend(
        section(
            "1. Visao geral do sistema",
            [
                p("O Chame o Tecnico centraliza a abertura de chamados, acompanhamento de OS, cadastro de clientes, tecnicos parceiros, financeiro, pecas, relatorios e configuracoes da empresa.", styles),
                callout("Objetivo principal: reduzir controle manual, organizar atendimento e permitir que o cliente acompanhe a OS de forma simples.", styles),
                table(
                    [
                        ["Area", "O que resolve"],
                        ["Portal publico", "Cliente abre chamado, informa endereco, equipamento, defeito e envia anexos."],
                        ["Painel admin", "Equipe acompanha OS, clientes, tecnicos, financeiro, relatorios e configuracoes."],
                        ["Area tecnica", "Tecnico consulta chamados, envia fotos, documentos e acompanha atendimentos."],
                        ["Backup", "ADM Master baixa um arquivo com os dados principais para PC, pendrive ou nuvem."],
                    ],
                    [4.1 * cm, 10.8 * cm],
                ),
            ],
            styles,
        )
    )
    story.append(PageBreak())

    story.extend(
        section(
            "2. Acesso, usuarios e permissoes",
            [
                p("O acesso administrativo e feito pela tela de login do admin. Cada usuario deve ter permissao ativa para visualizar os menus correspondentes.", styles),
                bullets(
                    [
                        "<b>ADM Master:</b> usuario com acesso a Usuarios e Configuracoes. Pode controlar permissoes e baixar backup completo.",
                        "<b>Atendimento:</b> foco em OS, clientes, triagem e acompanhamento.",
                        "<b>Financeiro:</b> acesso a recebimentos, contas, pagamentos e relatorios.",
                        "<b>Tecnico:</b> acesso separado pela area tecnica, com foco nos chamados atribuidos.",
                    ],
                    styles,
                ),
                note("Boa pratica: cada pessoa deve usar seu proprio login. Evite compartilhar senha do ADM Master.", styles),
            ],
            styles,
        )
    )
    story.append(PageBreak())

    story.extend(
        section(
            "3. Abertura de chamados e atendimento em MS",
            [
                p("O cliente pode abrir chamado pelo site informando dados pessoais, endereco, equipamento, marca, modelo, defeito e anexos como fotos ou nota fiscal em PDF.", styles),
                table(
                    [
                        ["Campo", "Orientacao"],
                        ["WhatsApp", "Usado para contato e consulta da OS."],
                        ["UF", "A abertura online esta liberada somente para Mato Grosso do Sul (MS)."],
                        ["Anexos", "Fotos do defeito, produto ou NF. Limite operacional: ate 6 arquivos."],
                        ["LGPD", "O cliente precisa autorizar o uso dos dados para abertura e atendimento."],
                    ],
                    [4 * cm, 10.9 * cm],
                ),
                callout("Se o cliente informar outro estado, o sistema bloqueia a OS e direciona para o WhatsApp 67 99205-8808.", styles),
            ],
            styles,
        )
    )
    story.append(PageBreak())

    story.extend(
        section(
            "4. Clientes",
            [
                p("A tela de clientes permite consultar a base cadastrada, editar dados e verificar historico de OS vinculadas.", styles),
                bullets(
                    [
                        "Use a busca para localizar por nome, documento, telefone, cidade ou numero da OS.",
                        "Mantenha CPF/CNPJ e WhatsApp atualizados para evitar duplicidade.",
                        "Antes de criar novo cliente manualmente, pesquise se ele ja existe.",
                        "Ao editar dados, revise endereco e cidade para facilitar atendimento tecnico.",
                    ],
                    styles,
                ),
                note("Cliente bem cadastrado melhora triagem, contato, faturamento e relatorio de recorrencia.", styles),
            ],
            styles,
        )
    )
    story.append(PageBreak())

    story.extend(
        section(
            "5. Ordens de servico",
            [
                p("A OS e o centro da operacao. Nela ficam cliente, equipamento, defeito, tecnico, status, fotos, pecas, valores, historico e finalizacao.", styles),
                table(
                    [
                        ["Etapa", "Como operar"],
                        ["Nova", "Conferir dados e identificar prioridade."],
                        ["Triagem", "Analisar defeito, anexos e melhor tecnico disponivel."],
                        ["Em atendimento", "Acompanhar execucao, fotos e movimentacoes."],
                        ["Orcamento", "Registrar valores, pecas e condicoes para aprovacao."],
                        ["Pronto aguardando entrega", "Usar quando o servico terminou e falta retirada/entrega."],
                        ["Finalizada", "Registrar entrega, pagamento e fechamento da OS."],
                    ],
                    [4.5 * cm, 10.4 * cm],
                ),
                callout("Registre tudo no historico da OS. Ele protege a operacao e ajuda em duvidas futuras.", styles),
            ],
            styles,
        )
    )
    story.append(PageBreak())

    story.extend(
        section(
            "6. Tecnicos e agenda",
            [
                p("O sistema permite cadastrar tecnicos parceiros, especialidades, area de atendimento e documentos. A agenda ajuda a organizar chamados por tecnico.", styles),
                bullets(
                    [
                        "Cadastre WhatsApp, cidade, estado, especialidades e disponibilidade.",
                        "Use a area do tecnico para ele acompanhar OS atribuidas.",
                        "Fotos e documentos enviados pelo tecnico ficam vinculados ao atendimento.",
                        "A integracao com Google Agenda pode ser usada para abrir compromisso do atendimento.",
                    ],
                    styles,
                ),
                note("Antes de atribuir OS, confira se o tecnico atende a categoria do equipamento e a cidade do cliente.", styles),
            ],
            styles,
        )
    )
    story.append(PageBreak())

    story.extend(
        section(
            "7. Financeiro, pecas e relatorios",
            [
                p("A area financeira concentra recebimentos, pagamentos ao tecnico, contas a pagar, documentos e relatorios gerenciais.", styles),
                table(
                    [
                        ["Modulo", "Uso recomendado"],
                        ["Financeiro", "Registrar valor recebido, forma de pagamento, repasse tecnico e contas."],
                        ["Pecas", "Controlar estoque, custo, venda e movimentacoes por OS."],
                        ["Relatorios", "Acompanhar faturamento, resultado, OS por periodo e indicadores."],
                    ],
                    [4 * cm, 10.9 * cm],
                ),
                bullets(
                    [
                        "Feche o financeiro da OS somente depois de revisar valores.",
                        "Registre pecas usadas para manter estoque e margem corretos.",
                        "Use relatorios por periodo para acompanhar crescimento e gargalos.",
                    ],
                    styles,
                ),
            ],
            styles,
        )
    )
    story.append(PageBreak())

    story.extend(
        section(
            "8. Configuracoes e backup",
            [
                p("Em Configuracoes, o ADM pode ajustar dados da empresa, identidade visual, textos da OS, categorias, marcas e gerar backup manual.", styles),
                table(
                    [
                        ["Funcao", "Como usar"],
                        ["Empresa", "Atualize razao social, CNPJ, WhatsApp, e-mail, site e endereco."],
                        ["Identidade visual", "Configure logos e cores usadas no painel e documentos."],
                        ["Tipos e marcas", "Cadastre categorias e marcas exibidas nos formularios."],
                        ["Backup", "Clique em Baixar backup para gerar arquivo JSON com os dados principais."],
                    ],
                    [4 * cm, 10.9 * cm],
                ),
                callout("Backup manual: depois de baixar, salve uma copia no PC e outra em pendrive ou pasta de nuvem.", styles),
                note("O backup inclui dados do banco e URLs de anexos. Arquivos fisicos em Storage devem ter politica propria de backup na nuvem.", styles),
            ],
            styles,
        )
    )
    story.append(PageBreak())

    story.extend(
        section(
            "9. Rotina recomendada",
            [
                p("Uma rotina simples evita perda de controle e melhora o atendimento ao cliente.", styles),
                table(
                    [
                        ["Quando", "O que fazer"],
                        ["Inicio do dia", "Abrir dashboard, revisar OS novas e prioridades."],
                        ["Durante o dia", "Atualizar status, registrar historico e conferir mensagens."],
                        ["Fim do dia", "Conferir OS em andamento, financeiro e proximos atendimentos."],
                        ["Semanal", "Baixar backup, revisar tecnicos, pecas e relatorios."],
                        ["Mensal", "Conferir usuarios ativos, permissoes, faturamento e indicadores."],
                    ],
                    [3.4 * cm, 11.5 * cm],
                ),
                bullets(
                    [
                        "Nunca deixe OS sem status atualizado.",
                        "Sempre registre observacoes importantes no historico.",
                        "Faca backup antes de alteracoes grandes no sistema.",
                        "Revise usuarios e permissoes periodicamente.",
                    ],
                    styles,
                ),
            ],
            styles,
        )
    )
    story.append(PageBreak())

    story.extend(
        section(
            "10. Suporte e proximos passos",
            [
                p("O sistema ja cobre a operacao principal, mas pode evoluir com automacoes e materiais de treinamento.", styles),
                table(
                    [
                        ["Proximo passo", "Beneficio"],
                        ["Backup automatico na nuvem", "Reduz risco de esquecimento do backup manual."],
                        ["Manual com imagens de tela", "Facilita treinamento de novos usuarios."],
                        ["Fluxo de WhatsApp mais avancado", "Agiliza comunicacao com cliente e tecnico."],
                        ["Relatorios comerciais", "Apoia venda do sistema para outras assistencias."],
                    ],
                    [4.7 * cm, 10.2 * cm],
                ),
                callout("Contato operacional atual para regioes fora de MS: WhatsApp 67 99205-8808.", styles),
            ],
            styles,
        )
    )

    story.append(Spacer(1, 20))
    if LOGO_CT.exists():
        story.append(Image(str(LOGO_CT), width=2.4 * cm, height=2.4 * cm, hAlign="CENTER"))
    story.append(Paragraph("Chame o Tecnico", styles["CoverSubtitle"]))

    doc.build(story)
    print(OUT)


if __name__ == "__main__":
    build_manual()
