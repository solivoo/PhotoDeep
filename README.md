# PhotoDeep

> **Procesador masivo de imágenes para e-commerce y catálogo con IA**

Aplicación local full-stack de alto rendimiento orientada al procesamiento masivo (*Bulk Processing*) de imágenes para e-commerce y catálogo. Permite recortar fondos con Inteligencia Artificial (`rembg`), componer nuevos fondos, aplicar efectos de estudio fotográfico (sombras proyectadas, contraste, brillo, márgenes) y optimizar a formato WebP, con feedback en tiempo real mediante SignalR.

**Repositorio oficial:** [https://github.com/solivoo/PhotoDeep](https://github.com/solivoo/PhotoDeep)  
**Autor:** solivo (<olivosergio09@gmail.com>)

---

## ⚡ Instalación Rápida Automática (Recomendada)

En cualquier PC con Linux o macOS, puedes clonar e instalar todo automáticamente con estos comandos:

```bash
# 1. Clonar el repositorio
git clone https://github.com/solivoo/PhotoDeep.git
cd PhotoDeep

# 2. Ejecutar instalador automático
# (Instala dependencias de rembg, compila .NET y descarga paquetes de Node)
./setup.sh

# 3. Iniciar Backend y Frontend simultáneamente
./start.sh
```

Una vez iniciado, abre tu navegador en:
* **Frontend:** [http://localhost:5173](http://localhost:5173)
* **Backend API / SignalR:** [http://localhost:5000](http://localhost:5000)

Para detener los servicios, simplemente presiona `Ctrl + C` en la terminal.

---

## 🛠️ Instalación Manual Paso a Paso

Si prefieres configurar cada componente de forma individual:

### Requisitos Previos del Sistema
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [Node.js 18+ con npm](https://nodejs.org/)
- [Python 3.10+](https://www.python.org/)

### Paso 1: Instalar Motor de IA (`rembg`)
```bash
pip install --user "rembg[cli]"

# Opcional: pre-descargar el modelo ligero u2netp (recomendado para 1.4s por foto)
python3 -c "
import urllib.request, pathlib
p = pathlib.Path.home() / '.rembg' / 'models' / 'u2netp'
p.mkdir(parents=True, exist_ok=True)
urllib.request.urlretrieve('https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx', p / 'u2netp.onnx')
"
```

### Paso 2: Preparar y Ejecutar Backend (.NET 10)
```bash
cd BulkImageProcessor.Api
dotnet restore
dotnet run
```
*El backend escuchará en `http://localhost:5000`.*

### Paso 3: Preparar y Ejecutar Frontend (React)
En una nueva terminal:
```bash
cd bulk-image-client
npm install
npm run dev
```
*El frontend estará listo en `http://localhost:5173`.*

---

## 🚀 Características Principales

- **Procesamiento 100% Local**: No depende de APIs en la nube ni terceros; todo se ejecuta en el hardware local.
- **Pipeline de IA Ultrarrápido**:
  - **Modo Rápido (`u2netp`)**: Inferencia optimizada en ~1.4s por foto, ideal para calzado, ropa, calcetines y productos de catálogo.
  - **Modo Detallado (`u2net`)**: Para segmentación profunda con bordes complejos y cabello fino.
- **Efectos de Estudio Fotográfico**:
  - Reemplazo y composición de fondo personalizado (ajuste automático en modo *cover*).
  - Sombras proyectadas con desenfoque, opacidad y elevación regulables.
  - Corrección de contraste y brillo por matriz cromática.
  - Margen interior (*padding*) configurable por lote o individualmente con previsualización en vivo.
- **Optimización WebP con SkiaSharp**: Codificación directa a WebP con calidad seleccionable (1% a 100%).
- **Descarga Masiva en ZIP**: Empaquetado nativo en streaming de imágenes seleccionadas en un solo archivo comprimido `.zip`.
- **Comunicación en Tiempo Real**: SignalR Hub que emite eventos de progreso paso a paso por imagen hacia la interfaz.
- **UI Profesional**: Construida en React 19 + Tailwind CSS v4 con tipografía *Plus Jakarta Sans*, modo de estudio oscuro neutro y alternador de rejilla de transparencia.

---

## 📦 Estructura del Repositorio

```
PhotoDeep/
├── setup.sh                         # Script de instalación automática
├── start.sh                         # Script de ejecución unificada (Backend + Frontend)
├── BulkImageProcessor.Api/          # Backend C# .NET 10
│   ├── Hubs/                        # SignalR Hub (ProcessingHub.cs)
│   ├── Services/                    # ImageProcessingService.cs (rembg + SkiaSharp)
│   ├── Program.cs                   # Endpoints Minimal API
│   └── BulkImageProcessor.Api.csproj
├── bulk-image-client/               # Frontend React 19 + Vite
│   ├── src/                         # Componentes, UI y cliente SignalR
│   ├── package.json
│   └── vite.config.js
├── .gitignore
└── README.md
```

---

## 👤 Autor

Desarrollado y mantenido por **solivo** (<olivosergio09@gmail.com>).
