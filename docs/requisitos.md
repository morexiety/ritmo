# Requisitos

Requisitos do MVP do Ritmo, descritos a partir do comportamento implementado. A coluna **Verificação** indica onde cada requisito é testado.

## Requisitos funcionais

| ID | Requisito | Verificação |
|---|---|---|
| RF01 | O usuário deve poder cadastrar uma tarefa informando um título. | `test/tasks.test.js` |
| RF02 | O sistema deve rejeitar títulos ausentes, vazios ou compostos apenas por espaços. | `test/tasks.test.js`, `test/database.test.js` |
| RF03 | Espaços no início e no fim do título devem ser removidos antes de salvar. | `test/tasks.test.js` |
| RF04 | Toda tarefa nova deve começar como não concluída. | `test/tasks.test.js` |
| RF05 | O sistema deve registrar automaticamente a data e hora de criação da tarefa. | `test/database.test.js` |
| RF06 | O usuário deve visualizar todas as suas tarefas, na ordem em que foram criadas. | `test/tasks.test.js` |
| RF07 | O usuário deve poder marcar uma tarefa como concluída e reabri-la. | `test/tasks.test.js` |
| RF08 | O usuário deve poder excluir uma tarefa. | `test/tasks.test.js` |
| RF09 | A interface deve exibir a mensagem "Nenhuma tarefa cadastrada." quando a lista estiver vazia. | Verificação manual |
| RF10 | A interface deve exibir uma mensagem de erro quando uma operação falhar. | Verificação manual |
| RF11 | As tarefas devem ser mantidas após reiniciar a aplicação. | `test/database.test.js`, `test/server.test.js`, `test/tasks.test.js` |
| RF12 | O visitante deve poder criar uma conta informando nome de usuário, e-mail e senha. | `test/auth.test.js` |
| RF13 | Nome de usuário (3 a 30 caracteres, sem `@`) e e-mail devem ser únicos, sem diferenciar maiúsculas de minúsculas; duplicidades são rejeitadas. | `test/auth.test.js`, `test/database.test.js` |
| RF14 | O usuário deve poder entrar informando o nome de usuário **ou** o e-mail, no mesmo campo, e a senha. | `test/auth.test.js` |
| RF15 | A sessão deve continuar válida ao atualizar a página ou reiniciar o servidor, até expirar (7 dias) ou até o logout. | `test/auth.test.js`, `test/tasks.test.js` |
| RF16 | Cada usuário deve acessar somente as próprias tarefas; as rotas de tarefas exigem autenticação. | `test/tasks.test.js`, `test/app.test.js` |
| RF17 | As páginas devem redirecionar conforme a sessão: `/` para `/login` sem sessão; `/login` e `/register` para `/` com sessão. | `test/server.test.js` |
| RF18 | O usuário deve poder sair, encerrando a sessão no servidor. | `test/auth.test.js`, `test/app.test.js` |
| RF19 | A exclusão de uma tarefa deve ser confirmada pelo usuário; ao cancelar, nada é alterado. | `test/app.test.js` |
| RF20 | Tarefas criadas antes da autenticação devem ser preservadas sem ficarem visíveis para nenhuma conta. | `test/database.test.js`, `test/tasks.test.js` |

## Requisitos não funcionais

| ID | Categoria | Requisito |
|---|---|---|
| RNF01 | Plataforma | Executar em Node.js 22.13 ou superior, tendo `fastify` como única dependência externa e sem etapa de build. |
| RNF02 | Persistência | Armazenar os dados em um arquivo SQLite local (padrão `data/ritmo.db`), criado automaticamente. |
| RNF03 | Integridade | O banco deve impedir título vazio, valores de `completed` diferentes de 0 e 1, username ou e-mail duplicados e referências a usuários inexistentes, independentemente da API. |
| RNF04 | Interface da API | Responder em JSON; entradas inválidas retornam HTTP 400; ausência de sessão, 401; token CSRF inválido, 403; identificadores inexistentes ou de outra conta, 404; username ou e-mail duplicado, 409. |
| RNF05 | Segurança | Usar consultas SQL parametrizadas; inserir os títulos na página como texto (sem interpretar HTML); escutar apenas em `127.0.0.1` por padrão. |
| RNF10 | Segurança — senhas | Guardar somente o hash scrypt da senha, com salt aleatório por senha; nunca gravar ou devolver a senha. |
| RNF11 | Segurança — sessões | Sessão por token aleatório em cookie `HttpOnly` e `SameSite=Lax` (`Secure` em produção), guardado no banco como SHA-256, com expiração e invalidação no logout. |
| RNF12 | Segurança — CSRF | Exigir o token CSRF da sessão (`X-CSRF-Token`) nas requisições autenticadas que alteram dados; aceitar apenas JSON no login e no cadastro. |
| RNF13 | Segurança — enumeração | O login deve responder da mesma forma para conta inexistente e senha incorreta. |
| RNF06 | Usabilidade | Interface em português, com páginas de login, cadastro e tarefas, e atualização da lista após cada operação. |
| RNF07 | Acessibilidade | Campos e botões com rótulos acessíveis, mensagens de erro anunciadas a leitores de tela (`role="alert"`), operações concluídas anunciadas por uma região `role="status"`, foco visível e botões com altura mínima de 44 px. |
| RNF08 | Responsividade | Layout utilizável em telas a partir de 375 px de largura, sem rolagem horizontal, com tema claro e escuro conforme o sistema. |
| RNF09 | Testabilidade | O servidor deve aceitar o caminho do banco por parâmetro, permitindo testes com banco isolado. |

## Restrições do MVP

- Não há recuperação de senha, login social (OAuth), perfis administrativos nem alteração de dados da conta.
- Não há limite de tentativas de login.
- Não é possível editar o título de uma tarefa já cadastrada.
- Não há filtros, prazos, categorias ou ordenação personalizada.
