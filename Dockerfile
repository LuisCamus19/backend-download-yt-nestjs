# 1. Usamos una imagen base ligera de Node.js (versión 20 en Alpine Linux)
FROM node:20-alpine

# 2. Instalamos las herramientas del sistema necesarias
# python3: Necesario porque yt-dlp está hecho en Python
# ffmpeg: Necesario para convertir/unir audio y video
# curl: Para descargar yt-dlp
RUN apk add --no-cache python3 ffmpeg curl

# 3. Descargamos el binario de yt-dlp directamente desde GitHub
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp

# 4. Le damos permisos de ejecución a yt-dlp
RUN chmod a+rx /usr/local/bin/yt-dlp

# 5. Establecemos el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# 6. Copiamos los archivos de dependencias primero (para aprovechar la caché de Docker)
COPY package*.json ./

# 7. Instalamos las dependencias del proyecto
RUN npm install

# 8. Copiamos el resto del código fuente
COPY . .

# 9. Compilamos la aplicación (de TypeScript a JavaScript)
RUN npm run build

# 10. Exponemos el puerto 3000 (informativo)
EXPOSE 3000

# 11. Comando para iniciar la aplicación en producción
CMD ["npm", "run", "start:prod"]