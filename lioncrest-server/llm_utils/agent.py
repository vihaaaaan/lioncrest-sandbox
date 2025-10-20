from typing import Any, Dict, List, Optional, Callable
from dotenv import load_dotenv
from pydantic import BaseModel
from openai import OpenAI
from logging_config import get_logger
import os

load_dotenv()
logger = get_logger(__name__)

class Tool(BaseModel):
    name: str
    description: str = ""
    input_schema: Dict[str, Any]
    func: Callable


class Agent:
    def __init__(self, model: str = "gpt-5"):
        self.model = model
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.tools: List[Tool] = {}
        
    def parse(self, input: List[Dict[str, Any]], *, text_format: Any, **kwargs,) -> Any:
        return self._client.responses.parse(
            model=self._model,
            input=input,
            text_format=text_format,
            temperature=0.0,
            **kwargs,
        )
    
    def chat(self, messages: List[Dict[str, str]], **kwargs) -> Any:
        return self._client.responses.create(
            model=self._model,
            messages=messages,
            **kwargs,
        )
    
    # ============= Tool Registration =============
    
    def register_tools(self, tools: List[Tool]) -> None:
        """Register a tool that the LLM can use"""
        for tool in tools:
            name = tool["name"]
            if name in self.tools:
                logger.warning(f"Tool {name} is already registered. Overwriting.")
            self.tools.append(tool)
        logger.info(f"Registered tool: {name}")
    
    def list_tools(self) -> List[str]:
        """List available tools"""
        return list(self.tools.keys())
    
    def use_tool(self, tool_name: str, **kwargs) -> Any:
        """Execute a registered tool"""
        if tool_name not in self.tools:
            raise ValueError(f"Tool '{tool_name}' not found. Available: {self.list_tools()}")
        
        tool = self.tools[tool_name]
        logger.info(f"Using tool: {tool_name}", extra={"params": kwargs})
        
        try:
            result = tool["func"](**kwargs)
            logger.info(f"Tool {tool_name} succeeded")
            return result
        except Exception as e:
            logger.error(f"Tool {tool_name} failed: {e}")
            raise

    # ============= Orchestration =============


