
#!/bin/bash

# Jenkins + SonarQube setup script for F1 Fantasy DevOps project

# Run this after a fresh Docker install

echo "=== Starting Jenkins + SonarQube setup ==="



# Create Jenkins network

docker network create jenkins 2>/dev/null || echo "Network already exists"

# Start Jenkins

docker run -d \

  --name jenkins \

  --network host \

  -v jenkins_home:/var/jenkins_home \

  -v /var/run/docker.sock:/var/run/docker.sock \

  jenkins/jenkins:lts

echo "Waiting for Jenkins to start..."

sleep 30

# Install dependencies in Jenkins container

docker exec -u root jenkins apt-get update -qq

docker exec -u root jenkins apt-get install -y libatomic1 unzip

# Install Node.js 22

docker exec -u root jenkins bash -c "curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs"

# Install SonarScanner

docker exec -u root jenkins bash -c "

  curl -sL https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-6.2.1.4610-linux-x64.zip -o /tmp/sonar.zip && \

  unzip -q /tmp/sonar.zip -d /opt/ && \

  ln -sf /opt/sonar-scanner-6.2.1.4610-linux-x64/bin/sonar-scanner /usr/local/bin/sonar-scanner

"

# Start SonarQube

docker run -d \

  --name sonarqube \

  --network host \

  -v sonarqube_data:/opt/sonarqube/data \

  -v sonarqube_logs:/opt/sonarqube/logs \

  sonarqube:lts-community

echo ""

echo "=== Setup complete ==="

echo "Jenkins:   http://localhost:8080"

echo "SonarQube: http://localhost:9000"

echo ""

echo "Jenkins initial password:"

sleep 20

docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword

