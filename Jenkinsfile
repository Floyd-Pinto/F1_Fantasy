// F1 Fantasy CI/CD pipeline. Full guide: docs/DEVOPS.md
//
// Triggered by a GitHub push webhook. Runs lint, tests with coverage, SonarQube analysis with a
// quality gate, builds the Docker images, and (when DEPLOY_HOST is set) deploys to a server over SSH.
//
// Requires (set up by devops/jenkins-setup.sh + docs/DEVOPS.md):
//   - Node.js 22, sonar-scanner and the Docker CLI on the agent
//   - Plugins: Pipeline, Git, GitHub, SonarQube Scanner, SSH Agent, Pipeline Stage View
//   - A SonarQube server named 'SonarQube' (Manage Jenkins → System) with a token credential
//   - SSH key credential 'deploy-ssh-key' (only for the deploy stage)
pipeline {
    agent any

    triggers {
        // Fires on GitHub push webhooks (POST http://<jenkins>/github-webhook/)
        githubPush()
    }

    parameters {
        booleanParam(name: 'RUN_SONAR', defaultValue: true, description: 'SonarQube analysis + quality gate')
        booleanParam(name: 'BUILD_IMAGES', defaultValue: true, description: 'Build backend and frontend Docker images')
        string(name: 'VITE_API_BASE', defaultValue: 'http://localhost:4000', description: 'API URL baked into the frontend image')
        string(name: 'DEPLOY_HOST', defaultValue: '', description: 'Server IP/hostname to deploy to (empty = no deploy)')
        string(name: 'DEPLOY_USER', defaultValue: 'ubuntu', description: 'SSH user on the server')
        string(name: 'APP_DIR', defaultValue: '~/F1_Fantasy', description: 'Repo checkout on the server')
    }

    environment {
        // Throwaway Postgres for integration tests. Host networking + PGPORT keeps it reachable from
        // the Jenkins container (also host-networked) without published ports.
        TEST_DB_PORT = '55499'
        TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:55499/f1_test"
        IMAGE_TAG = "${env.BUILD_NUMBER}"
    }

    options {
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
        timestamps()
    }

    stages {
        stage('Backend: lint & test') {
            steps {
                script {
                    def db = "f1-test-${env.BUILD_NUMBER}"
                    try {
                        sh """
                            docker run -d --rm --name ${db} --network host \
                              -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=f1_test -e PGPORT=${TEST_DB_PORT} \
                              postgres:16-alpine
                            for i in \$(seq 1 30); do docker exec ${db} pg_isready -U postgres -p ${TEST_DB_PORT} && break; sleep 1; done
                        """
                        dir('Backend') {
                            withEnv(["DATABASE_URL=${TEST_DATABASE_URL}"]) {
                                sh 'npm ci'
                                sh 'npm run lint'
                                sh 'npx prisma migrate deploy'
                                sh 'npm run test:coverage'   // writes coverage/lcov.info for SonarQube
                            }
                        }
                    } finally {
                        sh "docker rm -f ${db} || true"
                    }
                }
            }
        }

        stage('Frontend: lint, typecheck & build') {
            steps {
                dir('Frontend') {
                    sh 'npm ci'
                    sh 'npm run lint'
                    sh 'npm run typecheck'
                    sh 'npm run build'
                }
            }
        }

        stage('SonarQube analysis') {
            when { expression { params.RUN_SONAR } }
            steps {
                withSonarQubeEnv('SonarQube') {
                    sh 'sonar-scanner -Dsonar.projectVersion=${BUILD_NUMBER}'
                }
            }
        }

        stage('Quality gate') {
            when { expression { params.RUN_SONAR } }
            steps {
                // SonarQube calls back http://<jenkins>/sonarqube-webhook/ when analysis finishes.
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Docker images') {
            when { expression { params.BUILD_IMAGES } }
            steps {
                // --network host: build steps download packages; works regardless of the bridge network.
                sh """
                    docker build --network host -t f1-fantasy-backend:${IMAGE_TAG} -t f1-fantasy-backend:latest Backend
                    docker build --network host --build-arg VITE_API_BASE=${params.VITE_API_BASE} \
                      -t f1-fantasy-frontend:${IMAGE_TAG} -t f1-fantasy-frontend:latest Frontend
                    docker image ls 'f1-fantasy-*'
                """
            }
        }

        stage('Deploy') {
            when {
                allOf {
                    branch 'main'
                    expression { params.DEPLOY_HOST?.trim() }
                }
            }
            steps {
                // The server pulls the same commit and rebuilds with Docker Compose (deploy/deploy.sh).
                sshagent(['deploy-ssh-key']) {
                    sh """
                        ssh -o StrictHostKeyChecking=accept-new ${params.DEPLOY_USER}@${params.DEPLOY_HOST} \\
                          'APP_DIR=${params.APP_DIR} bash ${params.APP_DIR}/deploy/deploy.sh'
                    """
                }
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'Backend/coverage/lcov.info', allowEmptyArchive: true
        }
        success { echo 'Pipeline succeeded.' }
        failure { echo 'Pipeline failed: check the stage logs.' }
    }
}
