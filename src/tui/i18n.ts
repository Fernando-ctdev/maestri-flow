import type { Language } from "../config/language.js";

export type UiText = {
  screens: readonly [string, string][];
  title: Record<string, string>;
  body: Record<string, string>;
  connection: Record<string, string>;
  workspace: string;
  floor: string;
  screensLabel: string;
  loading: string;
  error: string;
  emptyCanvas: string;
  bindings: (count: number) => string;
  reviewReady: string;
  reviewIssues: (count: number) => string;
  actionHint: Record<string, string>;
  advanceHint: string;
  disabled: string;
  feedback: Record<string, string>;
  blocked: Record<string, string>;
  configureWire: string;
  fieldLabels: Record<string, string>;
  formHelp: string;
  savedPending: string;
  cancelled: string;
  invalid: string;
  shortcuts: string;
  nonInteractive: string;
};

const pt: UiText = {
  screens: [["connect", "Conexão"], ["provisioning", "Provisionamento"], ["canvas", "Canvas"], ["bindings", "Atores"], ["workflow", "Fluxo"], ["review", "Revisão"]],
  title: { connect: "Conectar ao Wire", provisioning: "Provisionamento", canvas: "Canvas ao vivo", bindings: "Vínculos de atores", workflow: "Editor de fluxo", review: "Revisão e salvamento" },
  body: { connect: "Faça o pareamento com Full control e escolha um workspace.", provisioning: "Use o canvas existente ou prepare uma solicitação ao Maestro.", canvas: "Revise terminais e conexões a partir do feed autoritativo.", bindings: "Vincule atores lógicos aos node IDs estáveis do canvas.", workflow: "Defina nós, resultados, ramificações e estados terminais.", review: "Resolva os erros antes de salvar o fluxo confirmado." },
  connection: { connected: "CONECTADO", loading: "CONECTANDO", error: "ERRO", idle: "OFFLINE" }, workspace: "Sem workspace", floor: "base", screensLabel: "TELAS", loading: "Carregando estado ao vivo…", error: "Erro", emptyCanvas: "Nenhum snapshot do canvas.", bindings: count => `${count} vínculo(s)`, reviewReady: "Pronto para salvar", reviewIssues: count => `${count} problema(s)`, actionHint: { connect: "Pressione Enter para testar a conexão", provisioning: "Pressione Enter para provisionar", canvas: "Pressione Enter para atualizar", review: "Pressione Enter para salvar" }, advanceHint: "Pressione Enter para avançar", disabled: "DESATIVADO", feedback: { connect: "Conexão iniciada", provisioning: "Provisionamento iniciado", canvas: "Atualização iniciada", review: "Salvamento iniciado" }, blocked: { connect: "Wire não configurado", provisioning: "Provisionador não configurado", canvas: "Feed do canvas não configurado", review: "Persistência não configurada" }, configureWire: "Configurar Wire", fieldLabels: { code: "Código de pareamento (6 dígitos)", host: "Host avançado", port: "Porta avançada", serverKeyHash: "Impressão digital SPKI SHA-256", token: "Bearer token (opcional)" }, formHelp: "Informe o código; Enter avança. SPKI é a impressão digital do certificado Wire: confirme no host/Full control antes de usar. Enter testa a conexão; Esc cancela.", savedPending: "Código salvo; pareamento pendente (Wire ainda não configurado).", cancelled: "Configuração cancelada", invalid: "Valor inválido", shortcuts: "←/→ n/b navegar · d canvas · 1–6 ir · q sair", nonInteractive: "maestri-flow configure (não interativo; use um TTY para navegar)"
};

const en: UiText = {
  screens: [["connect", "Connect"], ["provisioning", "Provision"], ["canvas", "Canvas"], ["bindings", "Actors"], ["workflow", "Workflow"], ["review", "Review"]],
  title: { connect: "Connect to Wire", provisioning: "Provisioning", canvas: "Live canvas", bindings: "Actor bindings", workflow: "Workflow builder", review: "Review & save" },
  body: { connect: "Pair Full control and choose a workspace.", provisioning: "Use the existing canvas or stage a Maestro handoff.", canvas: "Review terminals and connections from the authoritative feed.", bindings: "Bind logical actors to stable canvas node IDs.", workflow: "Define nodes, outcomes, branches and terminal states.", review: "Resolve errors before saving the confirmed workflow." },
  connection: { connected: "CONNECTED", loading: "CONNECTING", error: "ERROR", idle: "OFFLINE" }, workspace: "No workspace", floor: "ground", screensLabel: "SCREENS", loading: "Loading live state…", error: "Error", emptyCanvas: "No canvas snapshot yet.", bindings: count => `${count} binding(s)`, reviewReady: "Ready to save", reviewIssues: count => `${count} issue(s)`, actionHint: { connect: "Press Enter to test the connection", provisioning: "Press Enter to provision", canvas: "Press Enter to refresh", review: "Press Enter to save" }, advanceHint: "Press Enter to continue", disabled: "DISABLED", feedback: { connect: "Connection started", provisioning: "Provisioning started", canvas: "Refresh started", review: "Save started" }, blocked: { connect: "Wire is not configured", provisioning: "Provisioner is not configured", canvas: "Canvas feed is not configured", review: "Persistence is not configured" }, configureWire: "Configure Wire", fieldLabels: { code: "Pairing code (6 digits)", host: "Advanced host", port: "Advanced port", serverKeyHash: "SPKI SHA-256 certificate fingerprint", token: "Bearer token (optional)" }, formHelp: "Enter the code; Enter advances. SPKI is the Wire certificate fingerprint: confirm it on the host/Full control before using it. Enter tests the connection; Esc cancels.", savedPending: "Code saved; pairing pending (Wire is not configured yet).", cancelled: "Configuration cancelled", invalid: "Invalid value", shortcuts: "←/→ n/b navigate · d canvas · 1–6 jump · q quit", nonInteractive: "maestri-flow configure (non-interactive; use a TTY for navigation)"
};

export const uiText = (language: Language): UiText => language === "en" ? en : pt;
