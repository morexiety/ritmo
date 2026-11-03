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
| RF06 | O usuário deve visualizar todas as tarefas, na ordem em que foram criadas. | `test/tasks.test.js` |
| RF07 | O usuário deve poder marcar uma tarefa como concluída e reabri-la. | `test/tasks.test.js` |
| RF08 | O usuário deve poder excluir uma tarefa. | `test/tasks.test.js` |
| RF09 | A interface deve exibir a mensagem "Nenhuma tarefa cadastrada." quando a lista estiver vazia. | Verificação manual |
| RF10 | A interface deve exibir uma mensagem de erro quando uma operação falhar. | Verificação manual |
| RF11 | As tarefas devem ser mantidas após reiniciar a aplicação. | `test/database.test.js`, `test/server.test.js`, `test/tasks.test.js` |

## Requisitos não funcionais

| ID | Categoria | Requisito |
|---|---|---|
| RNF01 | Plataforma | Executar em Node.js 22.13 ou superior, tendo `fastify` como única dependência externa e sem etapa de build. |
| RNF02 | Persistência | Armazenar os dados em um arquivo SQLite local (padrão `data/ritmo.db`), criado automaticamente. |
| RNF03 | Integridade | O banco deve impedir título vazio e valores de `completed` diferentes de 0 e 1, independentemente da API. |
| RNF04 | Interface da API | Responder em JSON; entradas inválidas retornam HTTP 400 e identificadores inexistentes, HTTP 404. |
| RNF05 | Segurança | Usar consultas SQL parametrizadas; inserir os títulos na página como texto (sem interpretar HTML); escutar apenas em `127.0.0.1` por padrão. |
| RNF06 | Usabilidade | Interface em português, com uma única página e atualização da lista após cada operação. |
| RNF07 | Acessibilidade | Campos e botões com rótulos acessíveis, mensagens de erro anunciadas a leitores de tela (`role="alert"`), foco visível e botões com altura mínima de 44 px. |
| RNF08 | Responsividade | Layout utilizável em telas a partir de 375 px de largura, sem rolagem horizontal, com tema claro e escuro conforme o sistema. |
| RNF09 | Testabilidade | O servidor deve aceitar o caminho do banco por parâmetro, permitindo testes com banco isolado. |

## Restrições do MVP

- Aplicação de uso pessoal e local: não há autenticação nem separação de dados por usuário.
- Não é possível editar o título de uma tarefa já cadastrada.
- Não há filtros, prazos, categorias ou ordenação personalizada.
