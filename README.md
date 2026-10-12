# Tokyo Manji

Chat em grupo com canais de texto, sala de voz com vídeo e transmissão de tela, cargos com
autoridades, expulsão da call e avatar que reage quando a pessoa fala.

Feito com TanStack Start (React 19 + Vite + Tailwind v4) e um backend hospedado na Lovable Cloud.

## Requisitos

- Node.js 20 ou mais novo (com npm)
- Acesso à internet (o app conversa com o backend remoto)

## Rodar

```sh
npm i
npm run dev
```

Abra o endereço que aparecer no terminal (geralmente http://localhost:8080).

## Gerar uma versão de produção

```sh
npm run build
npm run preview
```

## Testes

```sh
npm test
```

## Configuração

O arquivo `.env` na raiz já aponta para o backend do projeto:

```
VITE_SUPABASE_URL=...        # endereço do backend
VITE_SUPABASE_PUBLISHABLE_KEY=...  # chave pública (não é segredo)
```

Se você criar um backend novo, troque esses dois valores. As tabelas, permissões e dados
iniciais estão em `drizzle/migrations/` — aplique-os na ordem (0000 até 0009) no banco novo.

O bucket de fotos de perfil chama-se `avatars` e é privado; as regras de leitura/escrita estão
nas próprias migrações.

## Como usar

- **Entrar:** digite um nickname e uma senha. Na primeira vez a senha é criada; depois só entra
  quem souber a senha daquele nickname. Entrar de novo desconecta o aparelho anterior.
- **Dono:** a conta `Shadow` é a dona do servidor. Só o dono cria/apaga cargos, dá cargos,
  define autoridades e cores, e troca apelidos de outras pessoas.
- **Cargos:** botão de cargos (só aparece para o dono). Cada cargo marca quais autoridades tem:
  mandar mensagens, tirar da call, apagar mensagens, ver histórico completo, trocar apelidos.
- **Call:** entre em um canal de voz. A lista "Na call" mostra quem está dentro e um ícone de
  microfone em quem está falando. Dá para ativar/desativar microfone, ligar a câmera e
  transmitir a tela. Só dá para entrar uma vez por call — se abrir em outra aba ou aparelho,
  avisa.
- **Expulsar:** dentro da call há botões por pessoa e um botão vermelho grande
  **"Expulsar Gordo"**, que tira da call todo mundo do cargo Gordo. Esses botões só aparecem
  para cargos com a autoridade "Tirar da call".
- **Chat:** canais de texto com envio, exclusão de mensagens (para quem tem a autoridade) e
  botão "Ver histórico completo".
- **Foto de perfil:** clique no seu avatar para enviar uma foto ou um GIF animado. O GIF fica
  parado enquanto a pessoa não fala e anima quando ela fala.

## Observações

- Microfone, câmera e transmissão de tela só funcionam em `https://` ou em `localhost`.
- O app não tem recuperação de senha. Se esquecer a senha de um nickname, o dono pode apagar o
  registro de login daquela pessoa no banco (`member_tokens`) para que ela defina uma nova.

## Estrutura

- `src/routes/` — páginas
- `src/components/app/` — chat, call, cargos, avatar, tela de entrada
- `src/lib/chat-data.ts` — leitura de dados e presença em tempo real
- `src/lib/members.functions.ts` — regras de acesso (login, cargos, autoridades)
- `drizzle/migrations/` — banco de dados e dados iniciais
