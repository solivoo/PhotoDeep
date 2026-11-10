#!/usr/bin/env bash
# ==============================================================================
# PhotoDeep — Script de Ejecución Unificada
# Autor: solivo <olivosergio09@gmail.com>
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}   Iniciando PhotoDeep (Backend + Frontend)           ${NC}"
echo -e "${BLUE}   Presiona Ctrl + C para detener ambos servicios     ${NC}"
echo -e "${BLUE}======================================================${NC}\n"

# Manejo de limpieza al salir
cleanup() {
    echo -e "\n${YELLOW}Deteniendo servicios...${NC}"
    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ]; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    echo -e "${GREEN}Servicios finalizados.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 1. Iniciar Backend .NET 10 en background
echo -e "${YELLOW}Iniciando Backend .NET 10 en http://localhost:5000...${NC}"
cd "$ROOT_DIR/BulkImageProcessor.Api"
dotnet run --launch-profile http &
BACKEND_PID=$!

# Esperar a que el backend empiece a escuchar
sleep 2

# 2. Iniciar Frontend Vite
echo -e "${YELLOW}Iniciando Frontend Vite en http://localhost:5173...${NC}"
cd "$ROOT_DIR/bulk-image-client"
npm run dev -- --host &
FRONTEND_PID=$!

echo -e "\n${GREEN}✓ Todo listo:${NC}"
echo -e "  • Frontend: ${BLUE}http://localhost:5173${NC}"
echo -e "  • Backend:  ${BLUE}http://localhost:5000${NC}\n"

# Esperar a que los procesos hijos terminen
wait
