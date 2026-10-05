# Ativação da assistente

O modo local funciona sem conta e guarda registros e documentos no IndexedDB do navegador. A IA generativa e a leitura de PDFs/fotos ainda exigem ativação. O painel original e sua chave local `plataforma_unemat_v5` permanecem intactos.

## Infraestrutura

1. Selecionar um projeto Supabase dedicado ao Transforma-Ações e confirmar plano/custo antes de criá-lo. Não aplicar o esquema em outro aplicativo.
2. Executar `schema.sql` por uma migração e revisar os advisors. As tabelas e o bucket são privados por usuário; os originais nunca vão para o GitHub.
3. Em Auth, configurar a URL do aplicativo e permitir a URL exata `https://ernandes-sobreira.github.io/transforma-acoes/assistente.html` nos redirecionamentos de confirmação e recuperação de senha. Configurar provedor de e-mail para produção.
4. Preencher somente URL e chave publicável em `assets/config.mjs`. Não inserir chave da OpenAI, service_role ou outro segredo no frontend.
5. Publicar a Edge Function `transforma-assistente` com `backend/index.ts` e `assets/finance.mjs`, preservando os caminhos relativos. Manter verificação de JWT ativada e a verificação adicional de usuário no handler.
6. Configurar no servidor `OPENAI_API_KEY`, `OPENAI_MODEL` (modelo com Responses, saídas estruturadas, imagens e PDFs) e `ALLOWED_ORIGINS`. Credenciais devem entrar pelo mecanismo seguro de segredos do provedor. Não enviar chaves por chat nem adicioná-las ao repositório.
7. Testar cadastro, confirmação, recuperação, upload, download, chat, extração e isolamento entre duas contas reais de teste antes de liberar a nuvem para usuários.

## Comportamento financeiro

- Valores monetários em centavos inteiros; orçamento desconhecido é `null`.
- Caixa livre = recebimentos registrados − despesas pagas − reservas ainda abertas.
- Saldo orçamentário = orçamento da rubrica − despesas pagas − reservas da rubrica.
- Uma reserva paga é cancelada com referência ao pagamento, mantendo rastreabilidade e evitando contagem dupla.
- Histórico não conferido bloqueia qualquer afirmação de disponibilidade. Conferência é declarada pelo responsável e não equivale à integração bancária.
- Simular não lança nem autoriza despesas; a elegibilidade depende do instrumento vigente e da análise responsável.
- A IA não tem ferramentas de mutação. Sua saída gera rascunhos que o usuário revisa no formulário.
- Arquivos guardados não viram pagamentos automaticamente. Os originais mantêm hash SHA-256, nome e metadados.

## Escala e limites

Cada conta possui um espaço independente. PostgreSQL/RLS e Storage permitem várias contas sem replicar o aplicativo. Nesta versão, o histórico da conta é um documento JSON com concorrência otimista, limitado a 10 MiB, e um snapshot de auditoria é preservado a cada atualização. Para equipes trabalhando simultaneamente e históricos grandes, normalizar projetos, lançamentos e mensagens em tabelas e implantar retenção de snapshots antes de ampliar a operação. Compartilhamento de projetos entre contas e permissões de equipe ainda não foram implementados.

As quotas são 10 consultas/minuto e 100/dia por conta; os limites de gastos globais também devem ser configurados no provedor. Não há cobrança implementada no aplicativo. Os custos reais dependem do modelo, arquivos, uso e plano escolhido.

## Backup e validação

O botão de backup inclui metadados e originais em JSON. Restauração apenas em espaço vazio, conferindo hashes; dados existentes não são sobrescritos. O backup contém informações privadas e deve ser guardado pelo responsável. O painel original não possuía transações financeiras para migrar; seus orçamentos são importados explicitamente, sem presumir que o recurso foi recebido.

Execute `npm test`. Sirva a raiz por HTTP para testar módulos no navegador. SDK Supabase 2.117.2 fixado no lockfile e incluído localmente em `assets/vendor` com licença.

Documentação consultada: https://supabase.com/docs/guides/functions/auth-headers ; https://supabase.com/docs/guides/storage/buckets/fundamentals ; https://developers.openai.com/api/docs/guides/structured-outputs ; https://developers.openai.com/api/docs/guides/file-inputs .
