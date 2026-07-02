# MyRecibo × Supabase — passo a passo (você executa, ~5 minutos)

O projeto é o mesmo do myhangar (`cctrfdgmtukfgbcqvscp`). Tudo do MyRecibo vive no
schema **`myrecibo`** — nada é criado em `public` e nenhum trigger é adicionado em
`auth.users`, então o myhangar não é afetado em nada.

## 1. Rodar o SQL
1. Dashboard → **SQL Editor** → New query.
2. Cole o conteúdo de `supabase/myrecibo-setup.sql` e **Run**.
3. Confira em **Table Editor** (troque o schema de `public` para `myrecibo` no seletor
   do topo): devem existir `profiles`, `companies` (com a Scheffer) e `expenses`.

## 2. Expor o schema na API (essencial!)
**Settings → API → Data API → Exposed schemas** → adicione `myrecibo` à lista
(mantendo o que já está lá). Sem isso o app recebe erro 406 em todas as chamadas.

## 3. Conferir a autenticação
- **Authentication → Providers → Email**: habilitado (senha no mínimo 6).
- **Authentication → URL Configuration**:
  - Site URL: `https://aviation-saas-myrecibo.vpqsrq.easypanel.host`
  - Redirect URLs: adicione a mesma URL (necessário p/ "esqueci minha senha").
- Se "Confirm email" estiver LIGADO, o cadastro pede confirmação por e-mail (ok para
  os colegas). Se quiser cadastro instantâneo, desligue — decisão sua.

## 4. Variáveis no deploy (EasyPanel)
No app do MyRecibo → **Build Args**:
- `VITE_SUPABASE_URL` = `https://cctrfdgmtukfgbcqvscp.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = (a anon key pública do projeto)
Depois **rebuild/redeploy**. Sem essas variáveis o app continua funcionando 100%
offline, sem login — é o interruptor da fase nuvem.

## 5. Como funciona depois de ligado
- Primeiro uso pede **login/cadastro** (uma vez, com internet). As despesas que já
  estavam no aparelho são adotadas pela conta e sobem no primeiro sync.
- Tudo continua offline-first: a nuvem é backup + multi-aparelho. Exclusão é sempre
  reversível no banco (soft-delete); nada é apagado fisicamente.
- **Vincular colega à Scheffer**: ele cria conta e digita o código `SCHEFFER2026`
  no Perfil → Empresa. Para criar outra empresa/código:
  `insert into myrecibo.companies (name, join_code) values ('Empresa X', 'CODIGO123');`
- Trocar o código de convite: `update myrecibo.companies set join_code='NOVO' where name='...';`

## Dúvidas rápidas
- **"Esqueci minha senha"** manda e-mail com link; ao abrir, o app loga e a pessoa
  troca a senha no Perfil → Conta.
- Ver dados de um usuário: Table Editor → `myrecibo.expenses` (filtre por `user_id`).
- As fotos ficam no **Storage → bucket `myrecibo`**, uma pasta por usuário.
