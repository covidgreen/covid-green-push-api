# Contact Tracing - Push Service Backend

### Set up service
​
The push service is a Fastify server, connecting to the same PostgreSQL instance as the API service.
​
- Install the dependencies and create a basic environment configuration.
​
```bash
npm install
npm run create:env
```
​​​
- Finally, start the server in development mode.
​
```bash
npm run start:dev
```
​
### Backend API Development
​
There are a number of handy commands you can run to help with development.
​
|Command | Action |
|---|---|
|`npm run start:dev` | Run the server in dev mode, automatically restarts on file change |
|`npm run create:env`| Create a new .env file |
|`npm test`| Run unit tests |
|`npm run test:watch`| Run backend tests in watch mode, running on changed test files |
|`npm run lint`| Run eslint |
|`npm run lint:fix`| Run eslint in fix mode |
