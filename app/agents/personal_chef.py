from langchain.chat_models import init_chat_model
from langchain_tavily import TavilySearch
from langgraph.checkpoint.sqlite import SqliteSaver
from langchain.agents import create_agent
from app.common.logger import logger
from langchain.messages import HumanMessage, AIMessage
from langchain_core.messages import AIMessageChunk
import os
import sqlite3

# 1. 加载环境变量
from dotenv import load_dotenv
load_dotenv()

# 2. web搜索工具，使用tavily作为web搜索工具（include_images 让结果携带真实图片URL）
tavily_search = TavilySearch(
    max_results=5,
    topic="general",
    include_images=True
)

# 3. 多模态模型
model = init_chat_model(
    model="qwen3.7-plus",
    model_provider="openai",
    base_url=os.getenv("DASHSCOPE_BASE_URL"),
    api_key=os.getenv("DASHSCOPE_API_KEY")
)

# 4. 初始化 checkpointer（路径相对本文件：app/agents/ -> app/db/）
_db_dir = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "db"))
os.makedirs(_db_dir, exist_ok=True)
_db_path = os.path.join(_db_dir, "personal_chef.db")
connection = sqlite3.connect(_db_path, check_same_thread=False)
checkpointer = SqliteSaver(connection)
checkpointer.setup()

# 5. agent系统提示词
system_prompt = """
你是私厨：根据用户现有食材推荐菜谱。中文，简洁，不闲聊。

# 食材识别
- 图片：整理所有可辨认的食材，不新鲜的标「不建议使用」；文字：直接整理。
- 认不出时请用户补充说明并结束，不调用工具。
- 用量固定写成「名称(数量) 克重」，如：西红柿(1个) 200g；估算值在克重前加「约」，不用「少许/适量」。

# 搜索
把可用食材合并为一次 tavily_search（如「西红柿 鸡蛋 家常菜做法」），最多 2 次；仍无结果就凭经验自创，不再搜。

# 输出
先食材清单，后菜谱，各只出现一次。

## 食材清单
每类一行：**类名**：项目、项目（顿号分隔），类与类之间换行，没有的类不写。
顺序：蔬菜、肉类、蛋类、海鲜、主食、豆制品、乳制品、水果、调味品、饮料、其他。
示例：**蔬菜**：西红柿(1个) 200g、西兰花(1盒) 约200g

## 食谱 Top 5：
按推荐度、简易度、营养排序；每道最多另买 2 种常见配料；菜与菜之间用 --- 分隔。每道格式：
- **1 菜名｜总时长**
- **评分**：营养 x/10，简易 x/10
- **食材**：全部写在同一行、顿号分隔，需购买的在该项后加「（需买）」，如：蒜(2瓣) 约10g（需买）
- **热量**：xxx kcal
- **营养**：蛋白 xg / 脂肪 xg / 碳水 xg / 纤维 xg / 钠 xmg / 钾 xmg / 钙 xmg / 铁 xmg / 维C xmg
- **理由**：一句话
- **配图**：仅当搜索结果里有确为这道菜的单张成品照时写 ![菜名](url)，否则省略此行；不编造 url
- **步骤**：≤7 步，每步标注分钟
"""

# 6. 创建agent
agent = create_agent(
    model=model,
    tools=[tavily_search],
    system_prompt=system_prompt,
    checkpointer=checkpointer
)

# 7.流式对话
async def search_recipes(prompt: str, image: str, thread_id: str):
    """调用agent搜索食谱"""
    logger.info(f"[用户]: {prompt}, image: {image}, thread_id: {thread_id}")
    try:
        # 判断是否有图片，封装不同格式的消息
        if not image or image.strip() == "":
            message = HumanMessage(content=prompt)
        else:
            message = HumanMessage(content=[
                {"type": "image", "url": image},
                {"type": "text", "text": prompt}
            ])

        # 流式调用agent
        for chunk, metadata in agent.stream(
                {"messages": [message]},
                {"configurable": {"thread_id": thread_id}},
                stream_mode="messages"
        ):
            if isinstance(chunk, AIMessageChunk) and chunk.content:
                yield chunk.content
    except Exception as e:
        logger.error(f"\n[错误]: {str(e)}")
        yield "信息检索失败，试试看手动输入食物列表？"

# 8.清空会话
def clear_messages(thread_id: str):
    """清空会话"""
    logger.info(f"清空历史消息, thread_id: {thread_id}")
    checkpointer.delete_thread(thread_id)

# 9.查询会话历史
def get_messages(thread_id: str) -> list[dict[str, str]]:
    """获取会话历史"""
    logger.info(f"获取历史消息，thread_id: {thread_id}")

    # 根据 thread_id 查询 checkpoint
    cp = checkpointer.get({"configurable": {"thread_id": thread_id}})

    # 如果不存在，返回空列表
    if not cp:
        return []

    # 安全获取 messages（channel_values 在 checkpoint 里，不能再查 checkpointer）
    channel_values = cp.get("channel_values")
    if not channel_values:
        return []
    messages = channel_values.get("messages", [])
    if not messages:
        return []

    # 转换消息格式
    result = []
    for msg in messages:
        if not msg.content:
            continue
        if isinstance(msg, HumanMessage):
            result.append({"role": "user", "content": msg.content})
        elif isinstance(msg, AIMessage):
            result.append({"role": "assistant", "content": msg.content})

    return result
