# UnitLab 2.0 — MongoDB + inicio de sesión + Render

Aplicación web para practicar los exámenes de unidad de seis asignaturas. Conserva **451 preguntas**: 221 de los PDF enviados (207 calificables, 14 marcadas «En revisión») y 230 preguntas PLUS (10 por cada una de las 23 unidades disponibles). Los enunciados, unidades, opciones, claves revisadas y notas se mantienen en `data/preguntas.json`.

## Funcionalidades

- Registro y acceso con correo electrónico y contraseña (contraseña hasheada con bcrypt).
- Sesión mediante cookie `HttpOnly`; en Render usa `Secure` y HTTPS, con sesiones almacenadas en MongoDB.
- Banco de 451 preguntas importado automáticamente a MongoDB la primera vez que se inicia la aplicación.
- Filtros por materia, unidad, preguntas originales/PLUS y por falladas previamente.
- Exámenes aleatorios, modo práctica y modo examen, revisión de errores, calificación de 0 a 5.
- Resultado validado por el servidor y guardado por cuenta en MongoDB; historial disponible desde otros dispositivos.
- Protección básica contra peticiones CSRF externas, rate limit para autenticación y cabeceras de seguridad.

**IMPORTANTE:** ya no se puede ejecutar abriendo `public/index.html` directamente como archivo local. Se necesita iniciar el backend (`npm start`), porque la autenticación y las preguntas se reciben desde las rutas `/api`.

## 1. Crear la base de datos en MongoDB Atlas

1. Entra a [MongoDB Atlas](https://www.mongodb.com/atlas) y crea una cuenta/proyecto.
2. Crea un clúster (elige la opción gratuita si está disponible para tu cuenta).
3. Ve a **Database Access** y crea un usuario de base de datos con contraseña segura. Para esta app, dale permisos `readWrite` sobre la base `unitlab` (el usuario de base de datos NO es el mismo con el que entrarás al simulador).
4. Ve a **Network Access**: autoriza las IP de salida del servicio de Render (aparecen en las opciones de networking del servicio) y la IP desde la que harás pruebas locales. Evita dar acceso global `0.0.0.0/0` de forma permanente.
5. En **Connect > Drivers > Node.js** copia la cadena `mongodb+srv://...`, reemplaza usuario/contraseña y agrega `/unitlab` antes de `?` si aún no aparece. Si tu contraseña incluye caracteres especiales, codifícalos para URL. Ejemplo orientativo:

   `mongodb+srv://USUARIO:CLAVE_CODIFICADA@TUCLUSTER.mongodb.net/unitlab?retryWrites=true&w=majority`

   Esta URL es **secreta**: nunca la coloques en `app.js`, en GitHub ni en archivos públicos.

## 2. Iniciar en tu computador Windows

Necesitas Node.js 20 o superior, acceso a internet y la conexión de Atlas ya configurada.

1. Descomprime el ZIP.
2. Abre PowerShell en la carpeta principal `UnitLab_Mongo_Render`.
3. Ejecuta:

   ```powershell
   npm install
   Copy-Item .env.example .env
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. Abre el archivo `.env` y cambia los valores de `MONGODB_URI` y `SESSION_SECRET`. Para `SESSION_SECRET`, pega el resultado aleatorio del comando anterior. Deja `NODE_ENV=development`.
5. Ejecuta:

   ```powershell
   npm start
   ```

6. Entra en **http://localhost:3000**. En **Crear cuenta** registra tu usuario del simulador y luego responde un examen.
7. Comprueba `http://localhost:3000/api/health`; debería devolver `{"status":"ok"}`.

Si da `ECONNREFUSED`, revisa que el servidor haya iniciado y que estés usando el puerto correcto. Si da `MongooseServerSelectionError`, verifica la URI, Network Access y el usuario de Atlas.

## 3. Subir el código a GitHub

Abre PowerShell en la raíz del proyecto:

```powershell
git init
git add .
git commit -m "UnitLab con login y MongoDB"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/UnitLab.git
git push -u origin main
```

Antes del `push`, crea en GitHub un repositorio **vacío** llamado `UnitLab` en tu cuenta. Sustituye `TU_USUARIO` por tu nombre de usuario. **No subas `.env`**: está ignorado por `.gitignore`. Puedes generar `package-lock.json` con `npm install`, y sí debes subirlo a GitHub para fijar versiones.

## 4. Publicar en Render (un servicio web, frontend y backend juntos)

1. Entra a [Render](https://dashboard.render.com) y selecciona **New > Web Service**.
2. Conecta tu repositorio de GitHub `UnitLab`.
3. Selecciona el entorno **Node** y un plan disponible (si aparece, puedes usar **Free**).
4. Configura:

   - **Build Command:** `npm install --omit=dev`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`

5. En **Environment** agrega las variables:

   | Clave | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `MONGODB_URI` | Tu URI privada de Atlas apuntando a `/unitlab` |
   | `SESSION_SECRET` | Una clave aleatoria de al menos 32 caracteres |

   Render proporciona la variable `PORT` automáticamente; no necesitas escribirla.
6. Autoriza en Atlas las **IP de salida de Render** de ese servicio. Las IP de salida de Render no son la URL pública del sitio.
7. Pulsa **Deploy Web Service**. Cuando el deployment sea correcto, Render te dará una URL `https://...onrender.com`.
8. Entra a la URL, crea un usuario y comprueba que puedes completar un examen. Inicia sesión desde otro navegador para verificar que el historial se conserva.

También se incluye `render.yaml` para desplegarlo como **Blueprint** desde Render; las variables secretas se solicitan durante la configuración y no están incluidas en ese archivo.

Consulta la documentación oficial: [Render Node/Express](https://render.com/docs/deploy-node-express-app), [Render y MongoDB Atlas](https://render.com/docs/connect-to-mongodb-atlas), [Variables de entorno en Render](https://render.com/docs/configure-environment-variables).

## 5. Organización de archivos

```text
UnitLab_Mongo_Render/
├── server.js                # API REST de Express, autenticación, MongoDB
├── scoring.js               # Calificación validada en el backend
├── package.json             # Dependencias y comandos de Node.js
├── .env.example             # Variables a configurar (sin contraseñas reales)
├── .gitignore               # Excluye .env y node_modules de Git
├── render.yaml              # Configuración opcional de Render Blueprint
├── public/
│   ├── index.html           # Login y páginas del simulador
│   ├── styles.css           # Estilos (responsive)
│   └── app.js               # Frontend y consumo de API
├── data/
│   └── preguntas.json       # 451 preguntas, fuente de importación inicial
├── docs/
│   ├── correcciones.csv     # Correcciones y discrepancias de SIMA
│   └── fuentes.md           # Fuentes consultadas en el banco
└── test/
    └── scoring.test.js      # Pruebas automáticas de calificación
```

Al arrancar con una base vacía se crean las colecciones `users`, `questions`, `attempts` y `sessions` a medida que se usan. No hay que crear manualmente tablas ni importar archivos JSON: la aplicación carga al inicio las preguntas ausentes según su ID, sin reemplazar las existentes.

## 6. Seguridad y aspectos a tener en cuenta

- Contraseñas hasheadas con bcrypt; sesiones del servidor en MongoDB y cookies `HttpOnly`.
- No se guardan tokens de sesión ni contraseñas en `localStorage`.
- Cada persona solo puede consultar y eliminar su propio historial.
- El contenido del banco es de lectura; no existe panel de edición de preguntas en línea.
- La cuenta registrada es independiente de cuentas universitarias/SIMA.
- Los intentos guardados en la anterior versión sin backend **no se migran automáticamente**.
- Si olvidas la contraseña, esta versión no incluye recuperación por correo; implementarlo requiere un servicio de email y flujos de recuperación seguros.
- Un despliegue real necesita un clúster de Atlas activo, IPs autorizadas, variables de Render y credenciales: esos recursos no se crean automáticamente con el ZIP.

## 7. Comprobar el proyecto

```powershell
npm test
node --check server.js
node --check public/app.js
```

Estas pruebas de lógica no sustituyen una prueba real con MongoDB Atlas. El frontend también se verificó en un navegador con respuestas de API simuladas. **No se pudo ejecutar una conexión real a Atlas en el entorno de creación porque no hay credenciales de tu cuenta, ni instalar paquetes npm desde la red del entorno**; ejecuta `npm install` y las pruebas integradas en tu computador o Render.
