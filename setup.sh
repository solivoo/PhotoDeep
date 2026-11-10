#!/usr/bin/env bash
# ==============================================================================
# PhotoDeep — Script de Instalación y Configuración Automática
# Autor: solivo <olivosergio09@gmail.com>
# Repositorio: https://github.com/solivoo/PhotoDeep
# ==============================================================================

set -e

# Colores para la terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}   PhotoDeep — Instalador Automático Local            ${NC}"
echo -e "${BLUE}   Autor: solivo <olivosergio09@gmail.com>            ${NC}"
echo -e "${BLUE}======================================================${NC}\n"

# 1. Comprobar Python y pip
echo -e "${YELLOW}[1/4] Comprobando Python y motor de IA rembg...${NC}"
if ! command -v python3 &>/dev/null; then
    echo -e "${RED}Error: python3 no está instalado. Por favor instálalo primero.${NC}"
    exit 1
fi

echo "Instalando rembg y dependencias de inferencia..."
python3 -m pip install --upgrade pip --quiet
python3 -m pip install "rembg[cli]" --quiet

# Detectar GPU NVIDIA para aceleración opcional
if command -v nvidia-smi &>/dev/null; then
    echo -e "${GREEN}✓ GPU NVIDIA detectada.${NC}"
fi

# Pre-descargar el modelo ligero u2netp (4.5 MB) para evitar esperas en la primera ejecución
echo "Pre-descargando pesos del modelo ligero u2netp (offline-ready)..."
python3 -c "
import urllib.request, os, pathlib
model_dir = pathlib.Path.home() / '.rembg' / 'models' / 'u2netp'
model_dir.mkdir(parents=True, exist_ok=True)
model_path = model_dir / 'u2netp.onnx'
if not model_path.exists():
    url = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx'
    print('Descargando u2netp.onnx (~4.5MB)...')
    urllib.request.urlretrieve(url, model_path)
    print('Modelo u2netp listo.')
else:
    print('Modelo u2netp ya presente en caché local.')
"

# 2. Comprobar .NET SDK 10
echo -e "\n${YELLOW}[2/4] Comprobando .NET 10 SDK y compilando Backend...${NC}"
if ! command -v dotnet &>/dev/null; then
    echo -e "${RED}Error: .NET SDK no está instalado. Instala .NET 10 desde https://dotnet.microsoft.com/download${NC}"
    exit 1
fi

DOTNET_VER=$(dotnet --version)
echo -e "Versión detectada de .NET: ${GREEN}$DOTNET_VER${NC}"

cd BulkImageProcessor.Api
dotnet restore
dotnet build -c Release
cd ..

# 3. Comprobar Node.js y preparar Frontend
echo -e "\n${YELLOW}[3/4] Comprobando Node.js y dependencias de Frontend...${NC}"
if ! command -v node &>/dev/null; then
    echo -e "${RED}Error: Node.js no está instalado. Instala Node.js 18+ desde https://nodejs.org/${NC}"
    exit 1
fi

cd bulk-image-client
npm install
cd ..

# 4. Crear carpetas de runtime
mkdir -p BulkImageProcessor.Api/temp_input
mkdir -p BulkImageProcessor.Api/output_webp

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}   ¡Instalación completada con éxito!                 ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "Para iniciar el sistema completo en cualquier momento, ejecuta:"
echo -e "   ${BLUE}./start.sh${NC}\n"
