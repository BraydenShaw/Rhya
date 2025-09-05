import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, FileText, Terminal, Paperclip, X, File, Image, Video, Music, Archive, FileIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import SessionList from './SessionList'
import FileExplorer from './FileExplorer'
import { ShellTerminal } from './ShellTerminal'
import { ResizablePanel } from './ResizablePanel'
import { useAgentConfig } from '../hooks/useAgentConfig'
import { MessageAnimation, LoadingDots } from './MessageAnimation'
import { MemoizedMessage } from './MemoizedMessage'
import axios from 'axios'

const API_BASE_URL = ''  // Use proxy in vite config

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: Date
  tool_name?: string
  tool_status?: string
  isStreaming?: boolean
  attachments?: FileAttachment[]
}

interface FileAttachment {
  id: string
  name: string
  size: number
  type: string
  url?: string
  uploadStatus: 'pending' | 'uploading' | 'completed' | 'error'
  uploadProgress?: number
}

interface Session {
  id: string
  title: string
  created_at: string
  last_message_at: string
  message_count: number
}

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  isExpanded?: boolean
  size?: number
  modified?: string
}

// 文件类型图标映射
const getFileIcon = (fileType: string, fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase()
  
  if (fileType.startsWith('image/')) return Image
  if (fileType.startsWith('video/')) return Video
  if (fileType.startsWith('audio/')) return Music
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension || '')) return Archive
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(extension || '')) return FileText
  return FileIcon
}

// 文件大小格式化
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showLoadingDelay, setShowLoadingDelay] = useState(false)
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [showFileExplorer, setShowFileExplorer] = useState(false)
  const [showShellTerminal, setShowShellTerminal] = useState(false)
  const [shellOutput, setShellOutput] = useState<Array<{ type: 'command' | 'output' | 'error'; content: string; timestamp: Date }>>([])
  
  // 文件上传相关状态
  const [attachedFiles, setAttachedFiles] = useState<FileAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [showAttachmentArea, setShowAttachmentArea] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageIdef = useRef<Set<string>>(new Set())
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const dragCounter = useRef(0)
  
  // Load agent configuration
  const { config, loading: configLoading } = useAgentConfig()

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading])

  // 延迟显示加载动画，避免闪烁
  useEffect(() => {
    if (isLoading) {
      loadingTimeoutRef.current = setTimeout(() => {
        setShowLoadingDelay(true)
      }, 200) // 200ms 延迟
    } else {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
      }
      setShowLoadingDelay(false)
    }
    
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
      }
    }
  }, [isLoading])

  const [ws, setWs] = useState<WebSocket | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')

  useEffect(() => {
    // Load initial file tree
    loadFileTree()
    
    // Keep track of current websocket instance
    let currentWebSocket: WebSocket | null = null
    let reconnectTimeout: NodeJS.Timeout | null = null
    
    // Connect to WebSocket
    const connectWebSocket = () => {
      // Clean up any existing connection
      if (currentWebSocket?.readyState === WebSocket.OPEN || currentWebSocket?.readyState === WebSocket.CONNECTING) {
        currentWebSocket.close()
      }
      
      setConnectionStatus('connecting')
      // 动态获取 WebSocket URL，支持代理和远程访问
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.hostname
      const port = window.location.port
      
      // 如果是通过代理访问，使用当前页面的 host
      let wsUrl = `${protocol}//${host}`
      if (port) {
        wsUrl += `:${port}`
      }
      wsUrl += '/ws'
      
      console.log('Connecting to WebSocket:', wsUrl)
      const websocket = new WebSocket(wsUrl)
      currentWebSocket = websocket
      
      websocket.onopen = () => {
        console.log('WebSocket connected')
        setConnectionStatus('connected')
        setWs(websocket)
      }
      
      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log('Received WebSocket message:', data)
          handleWebSocketMessage(data)
        } catch (error) {
          console.error('WebSocket message error:', error)
        }
      }
      
      websocket.onerror = (error) => {
        console.error('WebSocket error:', error)
        setConnectionStatus('disconnected')
      }
      
      websocket.onclose = () => {
        setConnectionStatus('disconnected')
        setWs(null)
        // Only reconnect if this is the current websocket
        if (websocket === currentWebSocket) {
          // Reconnect after 3 seconds
          reconnectTimeout = setTimeout(connectWebSocket, 3000)
        }
      }
    }
    
    connectWebSocket()
    
    return () => {
      // Clean up on unmount
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      if (currentWebSocket) {
        currentWebSocket.close()
      }
    }
  }, [])

  // 拖拽相关事件处理
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current++
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true)
      }
    }

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current--
      if (dragCounter.current === 0) {
        setIsDragging(false)
      }
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      dragCounter.current = 0

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        handleFiles(Array.from(e.dataTransfer.files))
      }
    }

    document.addEventListener('dragenter', handleDragEnter)
    document.addEventListener('dragleave', handleDragLeave)
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('drop', handleDrop)

    return () => {
      document.removeEventListener('dragenter', handleDragEnter)
      document.removeEventListener('dragleave', handleDragLeave)
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('drop', handleDrop)
    }
  }, [])

  const scrollToBottom = () => {
    // 使用setTimeout确保DOM更新后再滚动
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      // 备用方案：如果scrollIntoView不起作用，直接操作滚动容器
      const scrollContainer = messagesEndRef.current?.parentElement?.parentElement
      if (scrollContainer) {
        // 滚动到底部，但留出一点空间
        const targetScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight
        scrollContainer.scrollTo({
          top: targetScroll,
          behavior: 'smooth'
        })
      }
    }, 100)
  }

  const loadFileTree = async () => {
    try {
      const outputDir = config.files?.outputDirectory || 'output'
      const response = await axios.get(`${API_BASE_URL}/api/files/tree?path=${outputDir}`)
      let files = response.data
      
      if (!files || files.length === 0) {
        setFileTree([{
          name: 'output',
          path: 'output',
          type: 'directory',
          isExpanded: true,
          children: []
        }])
        return
      }
      
      let outputNode = files.find((f: any) => f.name === 'output' && f.type === 'directory')
      
      if (!outputNode) {
        outputNode = {
          name: 'output',
          path: 'output',
          type: 'directory',
          isExpanded: true,
          children: files
        }
        files = [outputNode]
      } else {
        outputNode.isExpanded = true
      }
      
      setFileTree(files)
    } catch (error) {
      console.error('Error loading file tree:', error)
      setFileTree([{
        name: 'output',
        path: 'output',
        type: 'directory',
        isExpanded: true,
        children: []
      }])
    }
  }

  // 文件处理函数
  const handleFiles = (files: File[]) => {
    const newAttachments: FileAttachment[] = files.map(file => ({
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: file.size,
      type: file.type,
      uploadStatus: 'pending'
    }))

    setAttachedFiles(prev => [...prev, ...newAttachments])
    setShowAttachmentArea(true)

    // 开始上传文件
    newAttachments.forEach(attachment => {
      const file = files.find(f => f.name === attachment.name && f.size === attachment.size)
      if (file) {
        uploadFile(file, attachment.id)
      }
    })
  }

  const uploadFile = async (file: File, attachmentId: string) => {
    const formData = new FormData()
    formData.append('file', file)

    try {
      // 更新上传状态
      setAttachedFiles(prev => prev.map(attachment => 
        attachment.id === attachmentId 
          ? { ...attachment, uploadStatus: 'uploading' as const, uploadProgress: 0 }
          : attachment
      ))

      const response = await axios.post(`${API_BASE_URL}/api/files/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1))
          setAttachedFiles(prev => prev.map(attachment => 
            attachment.id === attachmentId 
              ? { ...attachment, uploadProgress: percentCompleted }
              : attachment
          ))
        }
      })

      // 上传完成
      setAttachedFiles(prev => prev.map(attachment => 
        attachment.id === attachmentId 
          ? { ...attachment, uploadStatus: 'completed' as const, url: response.data.url }
          : attachment
      ))
    } catch (error) {
      console.error('File upload error:', error)
      setAttachedFiles(prev => prev.map(attachment => 
        attachment.id === attachmentId 
          ? { ...attachment, uploadStatus: 'error' as const }
          : attachment
      ))
    }
  }

  const removeAttachment = (attachmentId: string) => {
    setAttachedFiles(prev => prev.filter(attachment => attachment.id !== attachmentId))
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files))
    }
    // 清空input值，允许重复选择同一文件
    e.target.value = ''
  }

  // Session management functions
  const handleCreateSession = useCallback(async () => {
    if (ws && connectionStatus === 'connected' && !isCreatingSession) {
      setIsCreatingSession(true)
      // 清空当前消息
      setMessages([])
      ws.send(JSON.stringify({ type: 'create_session' }))
      // 设置超时，避免永久等待
      setTimeout(() => {
        setIsCreatingSession(false)
      }, 3000)
    }
  }, [ws, connectionStatus, isCreatingSession])

  const handleSelectSession = useCallback(async (sessionId: string) => {
    if (ws && connectionStatus === 'connected') {
      ws.send(JSON.stringify({ 
        type: 'switch_session',
        session_id: sessionId 
      }))
    }
  }, [ws, connectionStatus])

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    if (ws && connectionStatus === 'connected') {
      ws.send(JSON.stringify({ 
        type: 'delete_session',
        session_id: sessionId 
      }))
    }
  }, [ws, connectionStatus])

  const handleSend = () => {
      if (!input.trim() && attachedFiles.length === 0) return
      if (!ws || connectionStatus !== 'connected') {
        alert('未连接到服务器，请稍后重试')
        return
      }

      // 检查是否有文件正在上传
      const uploadingFiles = attachedFiles.filter(f => f.uploadStatus === 'uploading')
      if (uploadingFiles.length > 0) {
        alert('请等待文件上传完成')
        return
      }

      const newMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: input,
        timestamp: new Date(),
        attachments: attachedFiles.length > 0 ? [...attachedFiles] : undefined
      }

      setMessages(prev => [...prev, newMessage])
      setInput('')
      setAttachedFiles([])
      setShowAttachmentArea(false)
      setIsLoading(true)
      
      // 发送消息后立即滚动到底部
      scrollToBottom()

      // 构造 WebSocket 消息
      const wsMessage = {
        type: 'message',
        content: input,
        attachments: attachedFiles.map(file => ({
          id: file.id,
          name: file.name,
          size: file.size,
          type: file.type,
          url: file.url
        }))
      };

      // 打印 WebSocket 消息到控制台
      console.log('Sending WebSocket message:', JSON.stringify(wsMessage, null, 2));

      // Send message through WebSocket
      ws.send(JSON.stringify(wsMessage));
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleWebSocketMessage = useCallback((data: any) => {
    const { type, content, timestamp, id } = data
    
    // 如果消息有ID，检查是否已经处理过
    if (id && messageIdef.current.has(id)) {
      return
    }
    if (id) {
      messageIdef.current.add(id)
    }
    
    // Handle shell command responses
    if (type === 'shell_output') {
      setShellOutput(prev => [...prev, {
        type: 'output',
        content: data.output || '',
        timestamp: new Date()
      }])
      return
    }
    
    if (type === 'shell_error') {
      setShellOutput(prev => [...prev, {
        type: 'error',
        content: data.error || 'Command execution error',
        timestamp: new Date()
      }])
      return
    }
    
    if (type === 'sessions_list') {
      // 更新会话列表
      setSessions(data.sessions || [])
      setCurrentSessionId(data.current_session_id)
      setIsCreatingSession(false)
      return
    }
    
    if (type === 'session_messages') {
      // 加载会话历史消息
      const messages = data.messages || []
      setMessages(messages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      })))
      // 清除消息ID缓存，避免重复
      messageIdef.current.clear()
      messages.forEach((msg: any) => {
        if (msg.id) {
          messageIdef.current.add(msg.id)
        }
      })
      setIsCreatingSession(false)
      return
    }
    
    if (type === 'user') {
      // Skip echoed user messages
      return
    }
    
    if (type === 'tool') {
      // Tool execution status
      const { tool_name, status, is_long_running, result } = data
      let content = ''
      
      if (status === 'executing') {
        const icon = is_long_running ? '⏳' : '🔧'
        content = `${icon} 正在执行工具: **${tool_name}**${is_long_running ? ' (长时间运行)' : ''}`
      } else if (status === 'completed') {
        if (result) {
          // 保留原始格式，包括换行符
          content = `✅ 工具执行完成: **${tool_name}**\n` // \`\`\`json\n${result}\n\`\`\`
        } else {
          content = `✅ 工具执行完成: **${tool_name}**`
        }
      } else {
        content = `📊 工具状态更新: **${tool_name}** - ${status}`
      }
      
      const toolMessage: Message = {
        id: id || `tool-${Date.now()}`,
        role: 'tool' as const,
        content,
        timestamp: new Date(timestamp || Date.now()),
        tool_name,
        tool_status: status
      }
      
      // 使用函数式更新来避免消息重复
      setMessages(prev => {
        // 检查是否已经存在相同ID的消息
        if (prev.some(m => m.id === toolMessage.id)) {
          return prev
        }
        return [...prev, toolMessage]
      })
      // 工具消息后滚动到底部
      scrollToBottom()
      return
    }
    
    if (type === 'assistant' || type === 'response') {
      const assistantMessage: Message = {
        id: id || `assistant-${Date.now()}`,
        role: 'assistant',
        content: content || '',
        timestamp: new Date(timestamp || Date.now())
      }
      
      // 使用函数式更新来避免消息重复
      setMessages(prev => {
        // 检查是否已经存在相同ID的消息
        if (prev.some(m => m.id === assistantMessage.id)) {
          return prev
        }
        return [...prev, assistantMessage]
      })
      // 收到新消息后滚动到底部
      scrollToBottom()
    }
    
    if (type === 'complete') {
      setIsLoading(false)
      // 加载完成后滚动到底部
      scrollToBottom()
    }
    
    if (type === 'error') {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `❌ 错误: ${content}`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
      setIsLoading(false)
    }
  }, [])

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* 拖拽覆盖层 */}
      {isDragging && (
        <div className="fixed inset-0 bg-blue-500/20 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-2xl border-2 border-dashed border-blue-500">
            <div className="text-center">
              <Paperclip className="w-16 h-16 mx-auto mb-4 text-blue-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                拖拽文件到这里
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                释放鼠标以上传文件
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Session List Sidebar */}
      <ResizablePanel
        direction="horizontal"
        minSize={200}
        maxSize={400}
        defaultSize={280}
        className="border-r border-gray-200 dark:border-gray-700"
      >
        <SessionList
          sessions={sessions}
          currentSessionId={currentSessionId}
          onCreateSession={handleCreateSession}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
        />
      </ResizablePanel>

      {/* Main Content Area */}
      <div className="flex-1 flex">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 aurora-bg">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200/50 dark:border-gray-700/50 glass-premium glass-glossy flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              {config.ui?.title || 'Agent'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowShellTerminal(!showShellTerminal)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors btn-animated"
            >
              <Terminal className="w-4 h-4" />
              {showShellTerminal ? '隐藏终端' : '显示终端'}
            </button>
            <button
              onClick={() => setShowFileExplorer(!showFileExplorer)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors btn-animated"
            >
              <FileText className="w-4 h-4" />
              {showFileExplorer ? '隐藏文件' : '查看文件'}
            </button>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
              connectionStatus === 'connected' 
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                : connectionStatus === 'connecting'
                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-500' : 
                connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 
                'bg-red-500'
              }`} />
              <span>
                {connectionStatus === 'connected' ? '已连接' : 
                 connectionStatus === 'connecting' ? '连接中...' : 
                 '未连接'}
              </span>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-6 relative">
          <div className="max-w-4xl mx-auto space-y-6 h-full">
            {messages.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Bot className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                  <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
                    欢迎使用 {config.agent?.name || 'Agent'}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-500">
                    {config.agent?.welcomeMessage || '输入您的数据文件路径，开始符号回归分析'}
                  </p>
                </div>
              </div>
            ) : (
              <AnimatePresence initial={false} mode="popLayout">
                {messages.map((message, index) => (
                  <motion.div
                    key={message.id}
                    layout="position"
                    initial={index === messages.length - 1 ? { opacity: 0, y: 20 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.5 }}
                    className={`flex flex-col gap-2 w-full ${
                      message.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    {/* 消息区域，确保头像与内容水平对齐 */}
                    <div className={`flex items-center gap-3 max-w-[80%] w-auto ${
                      message.role === 'user' ? 'flex-row' : 'flex-row'
                    }`}>
                      <MemoizedMessage
                        id={message.id}
                        role={message.role}
                        content={message.content}
                        timestamp={message.timestamp}
                        isLastMessage={index === messages.length - 1}
                        isStreaming={message.isStreaming}
                        className="flex-1 min-w-0"
                      />
                    </div>
                    
                    {/* 文件附件显示 - 在消息下方，横向排列 */}
                    {message.attachments && message.attachments.length > 0 && (
                      <div className={`mt-1 flex flex-row flex-wrap gap-2 ${
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      } w-full`}>
                        {message.attachments.map((attachment) => {
                          const IconComponent = getFileIcon(attachment.type, attachment.name)
                          // 如果是图片类型，显示图片预览
                          if (attachment.type.startsWith('image/') && attachment.url) {
                            return (
                              <div
                                key={attachment.id}
                                className="max-w-[200px] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600"
                              >
                                <img
                                  src={attachment.url}
                                  alt={attachment.name}
                                  className="w-full h-auto object-contain"
                                  style={{ maxHeight: '300px' }}
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none'
                                    e.currentTarget.nextElementSibling!.style.display = 'flex'
                                  }}
                                />
                                <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700" style={{ display: 'none' }}>
                                  <IconComponent className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                      {attachment.name}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {formatFileSize(attachment.size)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )
                          }
                          // 非图片类型的附件保持原样
                          return (
                            <div
                              key={attachment.id}
                              className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg border max-w-[200px] min-w-[150px]"
                            >
                              <IconComponent className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                  {attachment.name}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {formatFileSize(attachment.size)}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            
            {showLoadingDelay && (
              <MessageAnimation isNew={true} type="assistant">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-4"
                >
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-2xl px-4 py-3 shadow-sm border border-gray-200 dark:border-gray-700">
                    <LoadingDots />
                  </div>
                </motion.div>
              </MessageAnimation>
            )}
            
            {/* 底部垫高，确保最后一条消息不贴底 */}
            <div className="h-24" />
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* 文件附件区域 */}
        {showAttachmentArea && attachedFiles.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  附件 ({attachedFiles.length})
                </h4>
                <button
                  onClick={() => setAttachedFiles([])}
                  className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                >
                  清空全部
                </button>
              </div>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {attachedFiles.map((attachment) => {
                  const IconComponent = getFileIcon(attachment.type, attachment.name)
                  return (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-3 p-2 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                    >
                      <IconComponent className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {attachment.name}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {formatFileSize(attachment.size)}
                          </p>
                          {attachment.uploadStatus === 'uploading' && (
                            <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                              <div 
                                className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${attachment.uploadProgress || 0}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${
                        attachment.uploadStatus === 'completed' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : attachment.uploadStatus === 'error'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                          : attachment.uploadStatus === 'uploading'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                      }`}>
                        {attachment.uploadStatus === 'completed' ? '✓ 完成' : 
                         attachment.uploadStatus === 'error' ? '✗ 失败' : 
                         attachment.uploadStatus === 'uploading' ? `${attachment.uploadProgress || 0}%` : 
                         '待上传'}
                      </div>
                      <button
                        onClick={() => removeAttachment(attachment.id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="border-t border-gray-200 dark:border-gray-700 glass-premium p-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-shrink-0 p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                title="上传文件"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息..."
                className="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-all input-animated glow"
                rows={1}
                style={{
                  minHeight: '48px',
                  maxHeight: '200px'
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height = `${target.scrollHeight}px`
                }}
              />
              <button
                onClick={handleSend}
                disabled={(!input.trim() && attachedFiles.length === 0) || isLoading || connectionStatus !== 'connected' || attachedFiles.some(f => f.uploadStatus === 'uploading')}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-medium hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl flex items-center gap-2 btn-animated liquid-button"
              >
                <Send className="w-4 h-4" />
                发送
              </button>
            </div>
            
            {/* 显示附件数量 */}
            {attachedFiles.length > 0 && !showAttachmentArea && (
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => setShowAttachmentArea(true)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {attachedFiles.length} 个文件已选择 - 点击查看
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* 隐藏的文件输入 */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
          accept="*/*"
        />
        </div>
        
        {/* File Explorer Sidebar */}
        {showFileExplorer && (
          <ResizablePanel
            direction="horizontal"
            minSize={400}
            maxSize={800}
            defaultSize={600}
            className="border-l border-gray-200 dark:border-gray-700"
            resizeBarPosition="start"
          >
            <FileExplorer
              isOpen={showFileExplorer}
              onClose={() => setShowFileExplorer(false)}
              fileTree={fileTree}
              onFileTreeUpdate={setFileTree}
              onLoadFileTree={loadFileTree}
            />
          </ResizablePanel>
        )}
      </div>
      
      {/* Shell Terminal */}
      <ShellTerminal
        isOpen={showShellTerminal}
        onClose={() => setShowShellTerminal(false)}
        onExecuteCommand={(command) => {
          if (command === '__clear__') {
            setShellOutput([])
            return
          }
          
          // Add command to output
          setShellOutput(prev => [...prev, {
            type: 'command',
            content: command,
            timestamp: new Date()
          }])
          
          // Send command to server
          if (ws && connectionStatus === 'connected') {
            ws.send(JSON.stringify({
              type: 'shell_command',
              command: command
            }))
          } else {
            setShellOutput(prev => [...prev, {
              type: 'error',
              content: 'Not connected to server',
              timestamp: new Date()
            }])
          }
        }}
        output={shellOutput}
      />
    </div>
  )
}

export default ChatInterface