import os
from pathlib import Path

# Caminho da pasta do seu projeto
caminho = r"C:\Users\rodrs\Desktop\HTML\modulo-dados"

print("=" * 60)
print("ESTRUTURA DO PROJETO")
print("=" * 60)

for raiz, pastas, arquivos in os.walk(caminho):
    nivel = raiz.replace(caminho, '').count(os.sep)
    indentacao = '  ' * nivel
    
    pasta_nome = os.path.basename(raiz)
    if nivel == 0:
        print(f"\n📁 {pasta_nome or 'modulo-dados'}/")
    else:
        print(f"{indentacao}📁 {pasta_nome}/")
    
    sub_indentacao = '  ' * (nivel + 1)
    for arquivo in arquivos:
        # Tamanho do arquivo
        tamanho = os.path.getsize(os.path.join(raiz, arquivo))
        if tamanho < 1024:
            tam_str = f"{tamanho} B"
        elif tamanho < 1024 * 1024:
            tam_str = f"{tamanho / 1024:.1f} KB"
        else:
            tam_str = f"{tamanho / (1024 * 1024):.1f} MB"
        
        print(f"{sub_indentacao}📄 {arquivo} ({tam_str})")

print("\n" + "=" * 60)
print("RESUMO POR TIPO")
print("=" * 60)

# Contagem por tipo
totais = {'js': 0, 'html': 0, 'json': 0, 'css': 0, 'md': 0, 'outros': 0}
for raiz, pastas, arquivos in os.walk(caminho):
    for arquivo in arquivos:
        ext = arquivo.split('.')[-1].lower() if '.' in arquivo else 'sem_ext'
        if ext in totais:
            totais[ext] += 1
        else:
            totais['outros'] += 1

for tipo, qtd in totais.items():
    if qtd > 0:
        print(f"  {tipo}: {qtd} arquivos")

print("\n" + "=" * 60)
print("PASTAS ENCONTRADAS")
print("=" * 60)

for raiz, pastas, arquivos in os.walk(caminho):
    nivel = raiz.replace(caminho, '').count(os.sep)
    if nivel > 0 or pastas:
        indentacao = '  ' * nivel
        nome_pasta = os.path.basename(raiz)
        if nome_pasta:
            print(f"{indentacao}📁 {nome_pasta}/")