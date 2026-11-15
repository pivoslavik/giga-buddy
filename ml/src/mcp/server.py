import os
from contextlib import asynccontextmanager

import asyncpg
from mcp.server.fastmcp import FastMCP

from .actions import DemoActions
from .routers import absence, access, drafts, knowledge, review

DB_POOL_MIN_SIZE = 1
DB_POOL_MAX_SIZE = 4
DB_POOL_TIMEOUT = 10
DB_POOL_COMMAND_TIMEOUT = 30


@asynccontextmanager
async def lifespan(app):
    async with asyncpg.create_pool(
        os.environ["DATABASE_URL"],
        min_size=DB_POOL_MIN_SIZE,
        max_size=DB_POOL_MAX_SIZE,
        timeout=DB_POOL_TIMEOUT,
        command_timeout=DB_POOL_COMMAND_TIMEOUT,
    ) as pool:
        app.state.actions = DemoActions(pool)
        async with mcp.session_manager.run():
            yield


mcp = FastMCP("buddy-tools", host="0.0.0.0", stateless_http=True, json_response=True)


for router in (knowledge, access, review, absence, drafts):
    for tool in router.TOOLS:
        mcp.add_tool(tool)


app = mcp.streamable_http_app()
app.router.lifespan_context = lifespan

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=mcp.settings.host, port=mcp.settings.port)
