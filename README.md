<img height="80" alt="metaverse" src="https://git.tivolicloud.com/tivolicloud/metaverse/raw/master/logo.png"/>

---

![pipeline status](https://git.tivolicloud.com/tivolicloud/metaverse/badges/master/pipeline.svg)
![coverage report](https://git.tivolicloud.com/tivolicloud/metaverse/badges/master/coverage.svg)

### Develop

Please use [yarn](https://yarnpkg.com) `npm i -g yarn` for dependencies. Npm is really terrible for CI/CD.

To start developing, you need to run two commands simulatenously.

```bash
cd server
yarn install # only once
yarn run start
```

```bash
cd frontend
yarn install # only once
yarn run start
```

They will both incrementally watch for file changes. The metaverse should now be available at http://localhost:3000

### Deploy

```bash
./build.sh
docker build -t tivolicloud/metaverse .
```

Fill out `docker-compose.yml`

Environment variables can be found in [server/src/environment.ts](server/src/environment.ts)

<!-- ### Deploy

Make sure to **disable Nginx** when deploying to **Elastic Beanstalk**.

### Docs

https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/platforms-linux-extend.html -->
