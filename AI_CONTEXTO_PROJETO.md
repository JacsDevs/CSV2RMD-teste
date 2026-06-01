# 🤖 INSTRUÇÕES PARA O AGENTE (AI HANDOFF)

**Bem-vindo de volta!** Se você (agente) está lendo isso, estamos continuando o desenvolvimento do projeto **CSV2DMLI (Dicionário Multimídia)**. Abaixo está o resumo atualizado do nosso progresso, da arquitetura e dos nossos próximos passos.

---

## 1. Sobre o Projeto
Um sistema gerador de dicionários que aceita uma planilha CSV, mídias (áudio, vídeo, imagens) e configurações (JSON/TXT), gerando páginas HTML ou PDFs (via compilador Typst em WebAssembly). 
A ferramenta funciona 100% offline no navegador ou via Tauri. Ela exporta projetos inteiros empacotados em arquivos ZIP ou pacotes HTML auto-suficientes com mídias embutidas (Base64) ou organizadas externamente.

## 2. O que já foi feito (Estado Atual da Arte)
- **Refatoração para ES6 Modular:** A arquitetura do sistema foi consolidada em módulos de responsabilidade única (`src/nucleo`, `src/utils`, `src/modulos`).
- **Remoção do Editor Visual:** Removemos completamente o antigo "Editor Visual" (`moduloEditor.js`), simplificando a lógica. A edição agora ocorre fora da ferramenta (no Excel/Calc) e o usuário simplesmente re-importa a Pasta de Trabalho (ZIP) atualizada.
- **Integração com File System e VFS Avançado:** O Sistema de Arquivos Virtual (`sistemaArquivosVirtual.js`) mapeia em RAM as fotos, vídeos e áudios. Ele interage dinamicamente com o novo gerador de projetos.
- **Exportação ZIP Unificada:** Todo o empacotamento é feito via JSZip.
  - Ao baixar a "Pasta de Trabalho", o `exportadorZip.js` gera o CSV, JSON e mídias no padrão (pastas `/foto`, `/audio`, `/video`).
  - Ao baixar os sites HTML, o gerador monta a mesma estrutura de diretórios e corrige automaticamente as dependências de caminho do HTML (`<img src="foto/...">`).
- **Design System Premium e Modais Estendidos:** Interface gráfica super polida (`style.css`), utilizando modais expansíveis e responsivos com painéis flexíveis (`flexbox`). Adicionamos animações refinadas, loaders e popups modernos.
- **Compilador PDF Nativo na Web (WASM):** Integramos com sucesso o `compiladorPdf.js`. Ele recebe o código Typst, mapeia as imagens dentro da sua própria memória restrita (`/foto/gato.jpg`) usando a VFS, e compila arquivos `.pdf` diretamente no navegador.

## 3. Dinâmica de Pré-visualização Inteligente
Implementamos um sistema de `Iframe` com tradução de Blob URLs. Como a página de preview não pode acessar o disco, interceptamos os scripts estáticos da tela de visualização e injetamos na hora as referências da memória (`blob:http...`), permitindo testar o comportamento de mídias dinâmicas sem que a geração final em disco seja corrompida.

## 4. Seus Próximos Passos (Próxima Sessão)
1. **Otimizações Finais de UX:** O sistema de drag and drop e as telas de carregamento foram ajustados. O próximo passo é refinar qualquer pequena fricção visual ou tratamento de erro que possa surgir no fluxo do Wizard.
2. **Novas Funcionalidades (Opcional):** Suporte avançado a novas mídias ou templates Typst adicionais se o usuário desejar.

> **Dica de Continuidade:** O projeto está extremamente estável no formato atual. A ordem de injeção das variáveis no HTML estático (geração de rotas VS geração do corpo HTML) foi milimetricamente alinhada para não quebrar a importação local de pastas no ZIP. 

---
*Assinado: O seu "Eu" do passado.*
