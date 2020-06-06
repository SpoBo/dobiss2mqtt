ARG ARCH=

# Use node to build the typescript stuff.
FROM node as builder

WORKDIR /app

COPY ["./package.json", "./package-lock.json", "/app/"]

RUN npm ci

COPY "./" "/app/"

## compile typescript
RUN npm run build

## remove packages of devDependencies
RUN npm prune --production

# second stage will be a new clean image in which we will drop the node_modules and the built dist folder
FROM ${ARCH}node:slim as runtime

WORKDIR /app

ENV NODE_ENV=production

# Expose the data volume in which we will look for the config file
VOLUME ["/data"]

## Copy the necessary files form builder
COPY --from=builder "/app/dist/" "/app/dist/"
COPY --from=builder "/app/node_modules/" "/app/node_modules/"
COPY --from=builder "/app/package.json" "/app/package.json"

CMD ["npm", "run", "start:prod"]
