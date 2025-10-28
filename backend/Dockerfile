FROM python:3.10-slim

# Instala dependências mínimas para pysmi
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    tzdata \
    wget \
    tini \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Configura fuso horário
ENV TZ=America/Sao_Paulo
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone && \
    dpkg-reconfigure -f noninteractive tzdata

WORKDIR /app

COPY requirements.txt .

# Instala dependências do Python (incluindo pysmi)
RUN pip install --no-cache-dir -r requirements.txt

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

COPY . .

EXPOSE 5000


ENTRYPOINT ["/usr/bin/tini", "--"]


CMD ["/entrypoint.sh"]