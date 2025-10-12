import asyncio
from telegram.ext import Application

class TelegramBot:
    def __init__(self, token):
        self.token = token
        self.application = (
            Application.builder()
            .token(self.token)
            .connect_timeout(20)
            .read_timeout(20)
            .build()
        )
        self.loop = asyncio.get_event_loop()
    def add_handler(self, handler):
        self.application.add_handler(handler)

    def start_bot(self):
        # Inicia o polling
        self.application.run_polling()

    async def start_polling(self):
        # Inicializa e inicia a aplicação de forma assíncrona
        await self.application.initialize()
        await self.application.start()
        await self.application.updater.start_polling()

    async def stop_bot(self):
        await self.application.updater.stop()
        await self.application.stop()    

    def agendar_tarefa(self, coro):
        """Agendar uma coroutine para ser executada no event loop."""
        asyncio.create_task(coro)
