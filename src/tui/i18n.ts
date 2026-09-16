import type { Language } from "../config/language.js";

export type UiText = {
  screens: readonly [string, string][];
  title: Record<string, string>;
  body: Record<string, string>;
  connection: Record<string, string>;
  workspace: string;
  workspacePrompt: string;
  terminalPickerPrompt: string;
  actorPrompt: string;
  taskActorPrompt: string;
  outcomePrompt: string;
  floor: string;
  screensLabel: string;
  loading: string;
  error: string;
  emptyCanvas: string;
  inputLabels: Record<"actor" | "taskActor" | "outcome", string>;
  inputHint: string;
  bindings: (count: number) => string;
  reviewReady: string;
  reviewIssues: (count: number) => string;
  workflowHints: string;
  runEmpty: string;
  runTokens: string;
  runEvents: string;
  pausedHint: string;
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
  screens: [["connect", "Conexão"], ["provisioning", "Provisionamento"], ["canvas", "Canvas"], ["bindings", "Atores"], ["workflow", "Fluxo"], ["review", "Revisão"], ["run", "Execução"]],
  title: { connect: "Conectar ao Wire", provisioning: "Provisionamento", canvas: "Canvas ao vivo", bindings: "Vínculos de atores", workflow: "Editor de fluxo", review: "Revisão e salvamento", run: "Execução do fluxo" },
  body: { connect: "Faça o pareamento com Full control e escolha um workspace.", provisioning: "Use o canvas existente ou prepare uma solicitação ao Maestro.", canvas: "Revise terminais e conexões a partir do feed autoritativo.", bindings: "Vincule atores lógicos aos node IDs estáveis do canvas.", workflow: "Defina nós, resultados, ramificações e estados terminais.", review: "Resolva os erros antes de salvar o fluxo confirmado.", run: "Acompanhe o run, os tokens e os resultados das tarefas." },
  workspacePrompt: "Escolha o workspace: ↑/↓ move · Enter seleciona · Esc cancela",
  terminalPickerPrompt: "Escolha o terminal: ↑/↓/número move · Enter seleciona · Esc cancela",
  actorPrompt: "Chave do ator para o terminal selecionado: digite · Enter confirma · Esc cancela",
  taskActorPrompt: "Chave do ator da tarefa: digite · Enter confirma · Esc cancela",
  outcomePrompt: "Outcome (formato: resultado destino): digite · Enter confirma · Esc cancela",
  connection: { connected: "CONECTADO", loading: "CONECTANDO", error: "ERRO", idle: "OFFLINE" },
  workspace: "Sem workspace",
  floor: "base",
  screensLabel: "TELAS",
  loading: "Carregando estado ao vivo…",
  error: "Erro",
  emptyCanvas: "Nenhum snapshot do canvas.",
  inputLabels: { actor: "Ator", taskActor: "Tarefa (ator)", outcome: "Outcome" },
  inputHint: "Enter envia · Esc cancela",
  bindings: count => `${count} vínculo(s)`,
  reviewReady: "Pronto para salvar",
  reviewIssues: count => `${count} problema(s)`,
  workflowHints: "t tarefa · x terminal · o outcome",
  runEmpty: "Nenhum run ativo.",
  runTokens: "Tokens",
  runEvents: "Eventos",
  pausedHint: "Run pausado: r retoma · c cancela · a revíncula ator",
  actionHint: { connect: "Pressione Enter para testar a conexão", provisioning: "Pressione Enter para provisionar", canvas: "Pressione Enter para atualizar", review: "Pressione Enter para salvar", bindings: "Pressione Enter para vincular um ator", workflow: "Pressione t para tarefa · x para terminal · o para outcome", run: "Pressione Enter para iniciar o run · p pausa" },
  advanceHint: "Pressione Enter para avançar",
  disabled: "DESATIVADO",
  feedback: { connect: "Conexão iniciada", provisioning: "Provisionamento iniciado", canvas: "Atualização iniciada", review: "Salvamento iniciado", bindActor: "Ator vinculado", workflowSaved: "Fluxo salvo", startRun: "Run iniciado", pauseRun: "Run pausado", resumeRun: "Run retomado", cancelRun: "Run cancelado", rebindRun: "Ator do run revinculado" },
  blocked: { connect: "Wire não configurado", provisioning: "Provisionador não configurado", canvas: "Feed do canvas não configurado", review: "Persistência não configurada", bindings: "Nenhum terminal no canvas", workflow: "Adicione uma tarefa antes do outcome", run: "Salve o fluxo antes de iniciar", rebindRun: "Nenhum ator vinculado para revincular" },
  configureWire: "Configurar Wire",
  fieldLabels: { code: "Código de pareamento (6 dígitos)", host: "Host avançado", port: "Porta avançada", serverKeyHash: "Impressão digital SPKI SHA-256", token: "Bearer token (opcional)" },
  formHelp: "Informe o código; Enter avança. SPKI é a impressão digital do certificado Wire: confirme no host/Full control antes de usar. Enter testa a conexão; Esc cancela.",
  savedPending: "Código salvo; pareamento pendente (Wire ainda não configurado).",
  cancelled: "Configuração cancelada",
  invalid: "Valor inválido",
  shortcuts: "←/→ n/b navegar · d canvas · 1–7 ir · q sair",
  nonInteractive: "maestri-flow configure (não interativo; use um TTY para navegar)"
};

const en: UiText = {
  screens: [["connect", "Connect"], ["provisioning", "Provision"], ["canvas", "Canvas"], ["bindings", "Actors"], ["workflow", "Workflow"], ["review", "Review"], ["run", "Run"]],
  title: { connect: "Connect to Wire", provisioning: "Provisioning", canvas: "Live canvas", bindings: "Actor bindings", workflow: "Workflow builder", review: "Review & save", run: "Run status" },
  body: { connect: "Pair Full control and choose a workspace.", provisioning: "Use the existing canvas or stage a Maestro handoff.", canvas: "Review terminals and connections from the authoritative feed.", bindings: "Bind logical actors to stable canvas node IDs.", workflow: "Define nodes, outcomes, branches and terminal states.", review: "Resolve errors before saving the confirmed workflow.", run: "Watch the run, its tokens and task results." },
  workspacePrompt: "Select a workspace: arrows move · Enter selects · Esc cancels",
  terminalPickerPrompt: "Select a terminal: arrows/number move · Enter selects · Esc cancels",
  actorPrompt: "Actor key for the selected terminal: type · Enter confirms · Esc cancels",
  taskActorPrompt: "Task actor key: type · Enter confirms · Esc cancels",
  outcomePrompt: "Outcome (format: outcome target): type · Enter confirms · Esc cancels",
  connection: { connected: "CONNECTED", loading: "CONNECTING", error: "ERROR", idle: "OFFLINE" },
  workspace: "No workspace",
  floor: "ground",
  screensLabel: "SCREENS",
  loading: "Loading live state…",
  error: "Error",
  emptyCanvas: "No canvas snapshot yet.",
  inputLabels: { actor: "Actor", taskActor: "Task (actor)", outcome: "Outcome" },
  inputHint: "Enter confirms · Esc cancels",
  bindings: count => `${count} binding(s)`,
  reviewReady: "Ready to save",
  reviewIssues: count => `${count} issue(s)`,
  workflowHints: "t task · x terminal · o outcome",
  runEmpty: "No active runs.",
  runTokens: "Tokens",
  runEvents: "Events",
  pausedHint: "Run paused: r resume · c cancel · a rebind actor",
  actionHint: { connect: "Press Enter to test the connection", provisioning: "Press Enter to provision", canvas: "Press Enter to refresh", review: "Press Enter to save", bindings: "Press Enter to bind an actor", workflow: "Press t for task · x for terminal · o for outcome", run: "Press Enter to start the run · p pauses" },
  advanceHint: "Press Enter to continue",
  disabled: "DISABLED",
  feedback: { connect: "Connection started", provisioning: "Provisioning started", canvas: "Refresh started", review: "Save started", bindActor: "Actor bound", workflowSaved: "Workflow saved", startRun: "Run started", pauseRun: "Run paused", resumeRun: "Run resumed", cancelRun: "Run cancelled", rebindRun: "Run actor rebound" },
  blocked: { connect: "Wire is not configured", provisioning: "Provisioner is not configured", canvas: "Canvas feed is not configured", review: "Persistence is not configured", bindings: "No canvas terminals", workflow: "Add a task before outcomes", run: "Save the workflow before starting", rebindRun: "No actor binding to rebind" },
  configureWire: "Configure Wire",
  fieldLabels: { code: "Pairing code (6 digits)", host: "Advanced host", port: "Advanced port", serverKeyHash: "SPKI SHA-256 certificate fingerprint", token: "Bearer token (optional)" },
  formHelp: "Enter the code; Enter advances. SPKI is the Wire certificate fingerprint: confirm it on the host/Full control before using it. Enter tests the connection; Esc cancels.",
  savedPending: "Code saved; pairing pending (Wire is not configured yet).",
  cancelled: "Configuration cancelled",
  invalid: "Invalid value",
  shortcuts: "←/→ n/b navigate · d canvas · 1–7 jump · q quit",
  nonInteractive: "maestri-flow configure (non-interactive; use a TTY for navigation)"
};

export const uiText = (language: Language): UiText => language === "en" ? en : pt;
