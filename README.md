# ShareLoom

> Compartición privada de archivos con cifrado del lado del cliente.

ShareLoom es una aplicación experimental para compartir archivos enfocada en la **privacidad desde el diseño**.

La idea principal es sencilla:

> **El archivo se cifra en el navegador antes de ser subido.**

El servidor y el almacenamiento reciben únicamente el archivo cifrado. La clave de cifrado permanece en el cliente y se comparte mediante el fragmento (`#`) de la URL.

---

## 🚧 Estado del proyecto

**MVP — En desarrollo**

ShareLoom se encuentra actualmente en una etapa temprana de desarrollo.

La primera versión busca validar la arquitectura principal:

- Cifrado del archivo en el navegador.
- AES-256-GCM mediante Web Crypto API.
- Subida directa del archivo cifrado a Amazon S3.
- URLs prefirmadas de S3 para las subidas.
- Almacenamiento de metadatos en Amazon DynamoDB.
- Compartición de la clave de descifrado mediante el fragmento de la URL.

La arquitectura y las funcionalidades evolucionarán progresivamente a medida que el proyecto madure.

---

# 🔐 ¿Cómo funciona?

ShareLoom está diseñado para que el archivo original **no tenga que llegar al backend**.

```text
                         SHARELOOM

┌──────────────────┐
│     Navegador    │
│                  │
│ Seleccionar      │
│ archivo          │
└────────┬─────────┘
         │
         ▼
┌──────────────────────┐
│    Web Crypto API    │
│                      │
│     AES-256-GCM      │
└──────────┬───────────┘
           │
           │ Archivo cifrado
           ▼
┌──────────────────────┐
│          S3          │
│                      │
│ Archivo cifrado      │
└──────────────────────┘


Navegador
    │
    │ POST /upload
    ▼
API Gateway
    │
    ▼
 Lambda
    │
    ├──────────────► DynamoDB
    │
    │ uploadUrl
    ▼
Navegador
    │
    │ PUT archivo cifrado
    ▼
S3
```

### Flujo de subida

1. El usuario selecciona un archivo.
2. El navegador lee el archivo localmente.
3. Se genera una clave AES-256-GCM.
4. Se genera un IV criptográficamente seguro.
5. El archivo se cifra localmente mediante Web Crypto API.
6. El navegador solicita una URL prefirmada al backend.
7. El backend devuelve `uploadUrl` y `fileId`.
8. El navegador sube directamente a S3 únicamente los bytes cifrados.
9. La clave de cifrado permanece en el cliente.
10. Se genera una URL para compartir el archivo.

---

# 🛡️ Concepto Zero-Knowledge

ShareLoom utiliza el fragmento (`#`) de la URL para mantener la clave de cifrado fuera de las peticiones HTTP.

Una URL de compartición tiene conceptualmente esta estructura:

```text
https://shareloom.example/#fileId:claveDeCifrado
```

Todo lo que aparece después de `#` es manejado por el navegador y no forma parte de la petición HTTP enviada al servidor.

De esta manera, el modelo buscado es:

```text
El servidor conoce:

    fileId
    archivo cifrado
    metadatos


El servidor NO recibe:

    archivo original
    clave de cifrado
```

### Importante

En esta etapa, "Zero-Knowledge" describe el **objetivo arquitectónico del MVP** y no constituye una garantía formal ni implica que el sistema haya pasado una auditoría de seguridad o criptográfica.

El modelo de seguridad será revisado y mejorado a medida que el proyecto evolucione.

---

# 🛠️ Tecnologías

## Frontend

- Angular
- TypeScript
- Web Crypto API
- HTML
- CSS

## Backend

- AWS Lambda
- Amazon API Gateway
- Amazon S3
- Amazon DynamoDB

## Criptografía

```text
AES-GCM
Clave de 256 bits
IV aleatorio
Web Crypto API
```

El MVP no utiliza librerías criptográficas externas.

---

# 📁 Estructura del proyecto

El frontend utiliza una estructura sencilla basada en Angular:

```text
shareloom-web/
│
├── src/
│   ├── app/
│   │   ├── components/
│   │   ├── services/
│   │   └── models/
│   │
│   ├── assets/
│   └── ...
│
├── public/
├── angular.json
├── package.json
├── tsconfig.json
└── README.md
```

La estructura puede cambiar a medida que el proyecto evolucione.

---

# 🚀 Instalación

## Requisitos

Necesitas tener instalado:

- Node.js
- npm
- Angular CLI

Puedes comprobar las versiones con:

```bash
node --version
npm --version
ng version
```

---

## Clonar el repositorio

```bash
git clone <URL_DEL_REPOSITORIO>
```

Entrar al proyecto:

```bash
cd shareloom-web
```

Instalar las dependencias:

```bash
npm install
```

---

# ▶️ Ejecutar en desarrollo

Inicia el servidor de desarrollo:

```bash
ng serve
```

Después abre:

```text
http://localhost:4200
```

en el navegador.

---

# ⚙️ Configuración

El frontend necesita conocer la URL del backend.

Durante el MVP puede configurarse mediante una constante sencilla:

```typescript
const API_URL = 'https://TU_API_GATEWAY_URL';
```

Posteriormente esta configuración puede migrarse a los archivos de entorno de Angular.

El backend debe exponer:

```http
POST /upload
```

y devolver una respuesta similar a:

```json
{
  "uploadUrl": "https://...",
  "fileId": "..."
}
```

El frontend utiliza posteriormente:

```http
PUT <uploadUrl>
```

para enviar directamente a S3 el archivo cifrado.

---

# ☁️ Arquitectura AWS

La arquitectura actual utiliza los siguientes servicios:

```text
                  ┌──────────────┐
                  │   Navegador  │
                  └──────┬───────┘
                         │
                         ▼
                  ┌──────────────┐
                  │ API Gateway  │
                  └──────┬───────┘
                         │
                         ▼
                  ┌──────────────┐
                  │    Lambda    │
                  └──────┬───────┘
                         │
                 ┌───────┴────────┐
                 ▼                ▼
          ┌─────────────┐  ┌─────────────┐
          │  DynamoDB   │  │     S3      │
          │             │  │             │
          │  Metadatos  │  │  Archivos   │
          │             │  │  cifrados   │
          └─────────────┘  └─────────────┘
```

La Lambda es responsable de:

1. Generar un `fileId`.
2. Guardar los metadatos en DynamoDB.
3. Generar una URL prefirmada de S3.
4. Devolver `uploadUrl` y `fileId`.

El frontend es responsable de:

1. Cifrar el archivo.
2. Solicitar la URL prefirmada.
3. Subir el archivo cifrado directamente a S3.
4. Mantener la clave de cifrado en el cliente.
5. Generar el enlace para compartir.

---

# 🔒 Principios de seguridad

El MVP sigue varios principios básicos de seguridad.

### Cifrado del lado del cliente

El archivo original se cifra antes de ser enviado.

### AES-256-GCM

Se utiliza AES-GCM con una clave de 256 bits para proporcionar confidencialidad e integridad al contenido cifrado.

### La clave no se envía al backend

La clave de cifrado no se envía a:

- API Gateway
- Lambda
- DynamoDB
- S3

### Subida directa a S3

El archivo cifrado se envía directamente a S3 mediante una URL prefirmada temporal.

### Fragmento de URL

La clave se coloca en el fragmento de la URL:

```text
https://shareloom.example/#fileId:clave
```

en lugar de utilizar parámetros de consulta.

---

# ⚠️ Limitaciones actuales

ShareLoom es un MVP y deliberadamente mantiene una arquitectura sencilla.

Actualmente no intenta resolver todos los problemas posibles relacionados con privacidad y compartición de archivos.

Entre las limitaciones actuales se encuentran:

- No existe autenticación de usuarios.
- No existen cuentas.
- No se soportan múltiples archivos simultáneamente.
- No hay cargas reanudables.
- No hay cargas multipart.
- No existe todavía un sistema avanzado para archivos grandes.
- No hay drag & drop.
- No existe vista previa de archivos.
- No se ha realizado una auditoría formal de seguridad.
- No se ha realizado una auditoría criptográfica.
- No existe todavía un sistema avanzado de gestión de claves.
- El flujo completo de eliminación/expiración seguirá evolucionando.

Estas limitaciones son conocidas y forman parte del alcance del MVP.

---

# 🗺️ Roadmap

Las siguientes funcionalidades podrán incorporarse progresivamente.

## Subida de archivos

- [ ] Drag & Drop
- [ ] Progreso de subida
- [ ] Soporte para archivos grandes
- [ ] Multipart uploads
- [ ] Cargas reanudables
- [ ] Múltiples archivos

## Cifrado

- [ ] Uso de Web Workers
- [ ] Cifrado por streaming
- [ ] Mejor manejo de archivos grandes
- [ ] Versionado del formato de archivos cifrados
- [ ] Mejoras en la gestión de claves

## Compartición

- [ ] Expiración de archivos
- [ ] Eliminación automática de objetos en S3
- [ ] Mejor gestión de enlaces
- [ ] Descarga y descifrado
- [ ] Protección opcional mediante contraseña

## Experiencia de usuario

- [ ] Animaciones
- [ ] Drag & Drop
- [ ] Indicador de progreso avanzado
- [ ] Mejoras para dispositivos móviles
- [ ] Temas claro/oscuro

## Infraestructura

- [ ] Infrastructure as Code
- [ ] Entornos de desarrollo y producción
- [ ] Monitorización
- [ ] Mejoras en logging
- [ ] CI/CD
- [ ] Despliegue automatizado

---

# 🧠 Filosofía del proyecto

ShareLoom sigue una filosofía **MVP-first**.

El objetivo no es construir desde el primer día la arquitectura definitiva.

El proceso será:

```text
Simple
   ↓
Funcional
   ↓
Seguro dentro del alcance del MVP
   ↓
Validar
   ↓
Aprender
   ↓
Mejorar
   ↓
Escalar
```

La complejidad debe introducirse cuando exista una necesidad real que la justifique.

> **Simple ahora, extensible después.**

---

# 🤝 Contribuciones

Las contribuciones, ideas y sugerencias son bienvenidas.

Para contribuir:

1. Haz un fork del repositorio.
2. Crea una rama para tu funcionalidad.
3. Realiza los cambios.
4. Comprueba que el proyecto compile correctamente.
5. Abre un Pull Request.

Si encuentras un problema de seguridad, evita publicar detalles sensibles antes de que pueda ser revisado.

---

# 📄 Licencia

La licencia del proyecto se definirá posteriormente.

---

# 💡 ¿Por qué ShareLoom?

La mayoría de los servicios tradicionales de compartición de archivos requieren que el archivo llegue primero a su infraestructura.

ShareLoom explora un enfoque diferente:

> **Cifrar primero. Subir después.**

El objetivo a largo plazo es crear una experiencia sencilla para compartir archivos donde la privacidad forme parte de la arquitectura desde el principio.

---

**ShareLoom — Privacidad desde el diseño.**
