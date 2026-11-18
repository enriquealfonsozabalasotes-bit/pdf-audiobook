# Audiobooks — PDF em áudio no iPhone

App pessoal: você adiciona um PDF, o app lê o texto, converte em áudio com uma voz do
Google (português do Brasil) e guarda tudo no celular para ouvir no carro, sem internet.

- Roda como app da tela inicial do iPhone (web app). Não precisa de Mac nem da App Store.
- **Nunca gasta dinheiro:** o app conta os caracteres enviados ao Google no mês e pausa a
  conversão antes de chegar a 95% da cota grátis (1 milhão de caracteres/mês). Ela continua
  sozinha no mês seguinte.
- Sua chave do Google fica salva só no seu iPhone.

## 1. Criar a chave do Google (uma vez)

1. Acesse <https://console.cloud.google.com/> com sua conta Google e crie um projeto
   (ex.: "audiobooks"). O Google pede um cartão para ativar o faturamento. Isso é obrigatório
   para usar a API, mas o app nunca passa da cota grátis.
2. Em **APIs e serviços → Biblioteca**, procure **Cloud Text-to-Speech API** e clique em **Ativar**.
3. Em **APIs e serviços → Credenciais → Criar credenciais → Chave de API**, crie a chave e copie.
4. **Restrinja a chave** (clique nela para editar):
   - *Restrições de API:* marque só **Cloud Text-to-Speech API**.
   - *Restrições de aplicativo:* **Referenciadores HTTP**, e adicione
     `https://SEU-USUARIO.github.io/*` (troque pelo seu usuário do GitHub).
5. **Segunda proteção:** em **Faturamento → Orçamentos e alertas**, crie um orçamento de
   R$ 1 com alerta por e-mail. Se o console oferecer uma cota de "caracteres por dia" para a
   API (em **IAM e administrador → Cotas**), coloque um limite baixo, como 50.000.
6. Não use essa chave em nenhum outro lugar. O contador do app só enxerga o próprio uso.

## 2. Publicar o app (uma vez)

1. Crie um repositório no GitHub chamado **`pdf-audiobook`**. O nome precisa ser exatamente
   esse, porque o app espera esse endereço.
2. Envie este projeto para lá (`git remote add origin …` e `git push -u origin main`).
3. No repositório: **Settings → Pages → Source: GitHub Actions**.
4. A cada push na `main`, o GitHub roda os testes e publica o app em
   `https://SEU-USUARIO.github.io/pdf-audiobook/`.

## 3. Instalar no iPhone

1. Abra o endereço acima no **Safari**.
2. Toque em **Compartilhar → Adicionar à Tela de Início**.
3. Abra o app pelo ícone (não pelo Safari) e vá em **⚙ Configurações**.
4. Cole a chave, toque em **Salvar chave** e depois em **Testar**.
5. Escolha a voz (use **Ouvir amostra**) e a velocidade padrão.

## Como usar

- **+ Adicionar PDF** → escolha o arquivo (Arquivos, iCloud, Drive). Revise os capítulos,
  desmarque o que não quer ouvir (sumário, bibliografia) e toque em **Converter**.
- A conversão só anda com o app **aberto e na tela**, porque o iOS congela apps web em
  segundo plano. Se você sair, ela continua de onde parou quando você voltar. Um livro de
  300 páginas leva alguns minutos.
- No player: tocar/pausar, ±30 s, velocidade, lista de capítulos. Ele lembra onde você
  parou em cada livro.

## No carro

O iOS às vezes pausa o áudio de apps web quando a tela bloqueia, e esses apps não aparecem
no CarPlay. Se isso acontecer:

1. No player, toque em **⬇ MP3** → **Salvar em Arquivos**.
2. Toque o arquivo pelo app **Arquivos** (ou por um player de áudio). Assim ele funciona
   com a tela bloqueada e pelos controles do carro.

## Limitações

- Só PDFs com **texto selecionável**. PDFs escaneados (foto da página) não funcionam.
- A limpeza tira cabeçalhos, rodapés, números de página e notas de rodapé, e lê duas
  colunas na ordem certa. Tabelas e legendas são lidas como texto.
- O contador da cota grátis também fica só no iPhone. Se os dados do app forem apagados no
  meio do mês, informe o uso real em **Configurações → Já usado este mês** (o valor está no
  Google Cloud, em Faturamento → Relatórios). O alerta de orçamento do passo 1.5 é a rede de
  segurança.
- O mês da cota vira à meia-noite do horário do Pacífico (EUA), umas 5h da manhã em Brasília,
  igual ao Google.
- Se o iPhone apagar os dados do app, os áudios somem. O texto fica guardado enquanto
  existir, e o botão **Reconverter** refaz o áudio. Os MP3 salvos em Arquivos são seu backup.
- Áudio com a tela bloqueada: _anotar aqui o resultado do teste no seu iPhone._

## Desenvolvimento

```bash
npm install
npm test        # testes (Vitest)
npm run dev     # servidor local
npm run build   # gera dist/
```

Documentos: `docs/superpowers/specs/` (design) e `docs/superpowers/plans/` (plano).
