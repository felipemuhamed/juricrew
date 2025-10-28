# ---------- Build stage ----------
FROM maven:3.9.8-eclipse-temurin-17 AS build
WORKDIR /build

# Cache deps first
COPY pom.xml .
RUN mvn -q -e -DskipTests dependency:go-offline

# Build + repackage Boot fat jar
COPY src ./src
RUN mvn -q -DskipTests package spring-boot:repackage

# ---------- Runtime stage ----------
FROM eclipse-temurin:17-jre
ENV JAVA_OPTS=""
WORKDIR /app
COPY --from=build /build/target/ai-app.jar /app/ai-app.jar
EXPOSE 3000
# Use sh -c so JAVA_OPTS is honored
ENTRYPOINT ["sh","-c","java $JAVA_OPTS -jar /app/ai-app.jar"]
