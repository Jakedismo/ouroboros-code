/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Agent Personas Configuration
 *
 * This file defines all available agent personas with their specialized prompts,
 * capabilities, and behavioral patterns. Each agent is an expert in their domain
 * and provides focused assistance for specific software engineering tasks.
 *
 * System prompts are loaded from individual markdown files in the prompts directory.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LSTool } from '../tools/ls.js';
import { GlobTool } from '../tools/glob.js';
import { GrepTool } from '../tools/grep.js';
import { RipGrepTool } from '../tools/ripGrep.js';
import { ReadFileTool } from '../tools/read-file.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import { EditTool } from '../tools/edit.js';
import { WriteFileTool } from '../tools/write-file.js';
import { ShellTool } from '../tools/shell.js';
import { MemoryTool } from '../tools/memoryTool.js';
import { WebFetchTool } from '../tools/web-fetch.js';
import { WebSearchTool } from '../tools/web-search.js';
import { UpdatePlanTool } from '../tools/update-plan.js';
import { LocalShellTool } from '../tools/local-shell.js';
import { ImageGenerationTool } from '../tools/image-generation.js';

// ES modules equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CORE_TOOL_SUGGESTIONS = [
  LSTool?.Name ?? 'list_directory',
  GlobTool?.Name ?? 'glob',
  GrepTool?.Name ?? 'search_file_content',
  RipGrepTool?.Name ?? 'ripgrep_search',
  ReadFileTool?.Name ?? 'read_file',
  ReadManyFilesTool?.Name ?? 'read_many_files',
  EditTool?.Name ?? 'replace',
  WriteFileTool?.Name ?? 'write_file',
  ShellTool?.Name ?? 'run_shell_command',
  LocalShellTool?.Name ?? 'local_shell',
  MemoryTool?.Name ?? 'save_memory',
  WebFetchTool?.Name ?? 'web_fetch',
  WebSearchTool?.Name ?? 'google_web_search',
  UpdatePlanTool?.Name ?? 'update_plan',
  ImageGenerationTool?.Name ?? 'generate_image',
].filter((name): name is string => typeof name === 'string' && name.length > 0);

export interface AgentPersona {
  id: string;
  name: string;
  emoji: string;
  category: string;
  description: string;
  specialties: string[];
  systemPrompt: string;
  suggestedTools?: string[];
  temperature?: number;
  examples?: string[];
}

export const AGENT_CATEGORIES = {
  ARCHITECTURE: 'Architecture & Design',
  AI_ML: 'AI/ML Specialists',
  SECURITY: 'Security & Compliance',
  PERFORMANCE: 'Performance & Optimization',
  DATABASE: 'Database & Data',
  DEVOPS: 'DevOps & Infrastructure',
  FRONTEND: 'Frontend Specialists',
  BACKEND: 'Backend Specialists',
  DOMAIN: 'Specialized Domains',
  PROCESS: 'Process & Quality',
} as const;

/**
 * Loads a system prompt from a markdown file
 */
function loadSystemPrompt(category: string, agentId: string): string {
  try {
    const promptPath = path.join(
      __dirname,
      'prompts',
      category,
      `${agentId}.md`,
    );
    if (fs.existsSync(promptPath)) {
      return fs.readFileSync(promptPath, 'utf-8');
    } else {
      console.warn(`System prompt file not found: ${promptPath}`);
      return `You are a ${agentId.replace('-', ' ')} specialist. Please provide expert assistance in your domain.`;
    }
  } catch (error) {
    console.error(`Error loading system prompt for ${agentId}:`, error);
    return `You are a ${agentId.replace('-', ' ')} specialist. Please provide expert assistance in your domain.`;
  }
}

/**
 * Maps category names to directory names
 */
const CATEGORY_DIRS: Record<string, string> = {
  [AGENT_CATEGORIES.ARCHITECTURE]: 'architecture-design',
  [AGENT_CATEGORIES.AI_ML]: 'ai-ml',
  [AGENT_CATEGORIES.SECURITY]: 'security-compliance',
  [AGENT_CATEGORIES.PERFORMANCE]: 'performance-optimization',
  [AGENT_CATEGORIES.DATABASE]: 'database-data',
  [AGENT_CATEGORIES.DEVOPS]: 'devops-infrastructure',
  [AGENT_CATEGORIES.FRONTEND]: 'frontend-specialists',
  [AGENT_CATEGORIES.BACKEND]: 'backend-specialists',
  [AGENT_CATEGORIES.DOMAIN]: 'specialized-domains',
  [AGENT_CATEGORIES.PROCESS]: 'process-quality',
};

const RAW_AGENT_PERSONAS: AgentPersona[] = [
  // ============= ARCHITECTURE & DESIGN SPECIALISTS =============
  {
    id: 'systems-architect',
    name: 'Systems Architect',
    emoji: '🏗️',
    category: AGENT_CATEGORIES.ARCHITECTURE,
    description:
      'Designs large-scale distributed systems with focus on scalability and reliability',
    specialties: [
      'Enterprise architecture',
      'Distributed systems',
      'Scalability patterns',
      'High availability',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.ARCHITECTURE],
      'systems-architect',
    ),
    temperature: 0.7,
  },

  {
    id: 'api-designer',
    name: 'API Designer',
    emoji: '🔌',
    category: AGENT_CATEGORIES.ARCHITECTURE,
    description:
      'Designs RESTful and GraphQL APIs with exceptional developer experience',
    specialties: [
      'REST principles',
      'GraphQL schemas',
      'API versioning',
      'OpenAPI specs',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.ARCHITECTURE],
      'api-designer',
    ),
    temperature: 0.6,
  },

  {
    id: 'solution-architect',
    name: 'Solution Architect',
    emoji: '🎯',
    category: AGENT_CATEGORIES.ARCHITECTURE,
    description:
      'Creates comprehensive solutions that bridge business and technical requirements',
    specialties: [
      'Business alignment',
      'End-to-end solutions',
      'Integration patterns',
      'Technology selection',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.ARCHITECTURE],
      'solution-architect',
    ),
    temperature: 0.7,
  },

  {
    id: 'microservices-architect',
    name: 'Microservices Architect',
    emoji: '🔀',
    category: AGENT_CATEGORIES.ARCHITECTURE,
    description:
      'Specializes in microservices decomposition and distributed system design',
    specialties: [
      'Service decomposition',
      'Domain boundaries',
      'Distributed patterns',
      'Event-driven design',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.ARCHITECTURE],
      'microservices-architect',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  {
    id: 'cloud-architect',
    name: 'Cloud Architect',
    emoji: '☁️',
    category: AGENT_CATEGORIES.ARCHITECTURE,
    description:
      'Designs cloud-native architectures and multi-cloud strategies',
    specialties: [
      'AWS',
      'Azure',
      'GCP',
      'Multi-cloud',
      'Cloud-native patterns',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.ARCHITECTURE],
      'cloud-architect',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  // ============= AI/ML SPECIALISTS =============
  {
    id: 'ml-engineer',
    name: 'Machine Learning Engineer',
    emoji: '🤖',
    category: AGENT_CATEGORIES.AI_ML,
    description:
      'Implements production ML systems with comprehensive MLOps practices',
    specialties: [
      'Model training',
      'MLOps',
      'Feature engineering',
      'Model serving',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.AI_ML],
      'ml-engineer',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  {
    id: 'data-scientist',
    name: 'Data Scientist',
    emoji: '📊',
    category: AGENT_CATEGORIES.AI_ML,
    description:
      'Transforms business problems into data-driven insights and solutions',
    specialties: [
      'Statistical analysis',
      'Predictive modeling',
      'Data visualization',
      'Business insights',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.AI_ML],
      'data-scientist',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  {
    id: 'computer-vision-expert',
    name: 'Computer Vision Expert',
    emoji: '👁️',
    category: AGENT_CATEGORIES.AI_ML,
    description:
      'Develops advanced computer vision systems using deep learning',
    specialties: [
      'Image processing',
      'Object detection',
      'Deep learning',
      'Video analysis',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.AI_ML],
      'computer-vision-expert',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  {
    id: 'nlp-specialist',
    name: 'NLP Specialist',
    emoji: '🗣️',
    category: AGENT_CATEGORIES.AI_ML,
    description:
      'Creates sophisticated natural language processing and understanding systems',
    specialties: [
      'Language models',
      'Text processing',
      'Sentiment analysis',
      'Conversational AI',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.AI_ML],
      'nlp-specialist',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  {
    id: 'llm-integration-expert',
    name: 'LLM Integration Expert',
    emoji: '🧠',
    category: AGENT_CATEGORIES.AI_ML,
    description:
      'Specializes in LLM integration, RAG systems, and AI agent architectures',
    specialties: [
      'LLM APIs',
      'RAG systems',
      'Agent frameworks',
      'Prompt engineering',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.AI_ML],
      'llm-integration-expert',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  // ============= SECURITY & COMPLIANCE =============
  {
    id: 'security-auditor',
    name: 'Security Auditor',
    emoji: '🔒',
    category: AGENT_CATEGORIES.SECURITY,
    description:
      'Conducts comprehensive security audits and vulnerability assessments',
    specialties: [
      'Vulnerability assessment',
      'Security auditing',
      'Threat modeling',
      'Risk analysis',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.SECURITY],
      'security-auditor',
    ),
    suggestedTools: ['read_file', 'write_file', 'grep', 'web_fetch'],
    temperature: 0.6,
  },

  {
    id: 'devsecops-engineer',
    name: 'DevSecOps Engineer',
    emoji: '🛡️',
    category: AGENT_CATEGORIES.SECURITY,
    description:
      'Integrates security into the development lifecycle with automation',
    specialties: [
      'Shift-left security',
      'Security automation',
      'SAST/DAST',
      'Container security',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.SECURITY],
      'devsecops-engineer',
    ),
    suggestedTools: ['read_file', 'write_file', 'grep', 'web_fetch'],
    temperature: 0.6,
  },

  {
    id: 'privacy-engineer',
    name: 'Privacy Engineer',
    emoji: '🔐',
    category: AGENT_CATEGORIES.SECURITY,
    description: 'Implements privacy-by-design principles and GDPR compliance',
    specialties: [
      'Privacy by design',
      'GDPR compliance',
      'Data protection',
      'Consent management',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.SECURITY],
      'privacy-engineer',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.5,
  },

  {
    id: 'compliance-specialist',
    name: 'Compliance Specialist',
    emoji: '📋',
    category: AGENT_CATEGORIES.SECURITY,
    description:
      'Ensures adherence to regulatory frameworks and industry standards',
    specialties: [
      'Regulatory compliance',
      'Audit preparation',
      'Policy development',
      'Risk management',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.SECURITY],
      'compliance-specialist',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.5,
  },

  {
    id: 'penetration-tester',
    name: 'Penetration Tester',
    emoji: '🎯',
    category: AGENT_CATEGORIES.SECURITY,
    description: 'Performs ethical hacking and advanced security testing',
    specialties: [
      'Ethical hacking',
      'Security testing',
      'Exploit development',
      'Red teaming',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.SECURITY],
      'penetration-tester',
    ),
    suggestedTools: ['read_file', 'write_file', 'grep', 'web_fetch'],
    temperature: 0.7,
  },

  // ============= PERFORMANCE & OPTIMIZATION =============
  {
    id: 'performance-engineer',
    name: 'Performance Engineer',
    emoji: '⚡',
    category: AGENT_CATEGORIES.PERFORMANCE,
    description:
      'Optimizes system performance through profiling and load testing',
    specialties: [
      'Performance profiling',
      'Load testing',
      'Bottleneck analysis',
      'Optimization',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.PERFORMANCE],
      'performance-engineer',
    ),
    suggestedTools: ['read_file', 'write_file', 'grep', 'web_fetch'],
    temperature: 0.6,
  },

  {
    id: 'scalability-architect',
    name: 'Scalability Architect',
    emoji: '📈',
    category: AGENT_CATEGORIES.PERFORMANCE,
    description: 'Designs systems for massive scale and high availability',
    specialties: [
      'Horizontal scaling',
      'Distributed systems',
      'Auto-scaling',
      'Capacity planning',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.PERFORMANCE],
      'scalability-architect',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.6,
  },

  {
    id: 'database-optimizer',
    name: 'Database Optimizer',
    emoji: '🗄️',
    category: AGENT_CATEGORIES.PERFORMANCE,
    description:
      'Optimizes database performance through query tuning and indexing',
    specialties: [
      'Query optimization',
      'Index design',
      'Database tuning',
      'Performance analysis',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.PERFORMANCE],
      'database-optimizer',
    ),
    suggestedTools: ['read_file', 'write_file', 'grep', 'web_fetch'],
    temperature: 0.6,
  },

  {
    id: 'caching-specialist',
    name: 'Caching Specialist',
    emoji: '💾',
    category: AGENT_CATEGORIES.PERFORMANCE,
    description:
      'Implements sophisticated caching strategies and invalidation patterns',
    specialties: [
      'Cache design',
      'Distributed caching',
      'Cache invalidation',
      'Performance optimization',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.PERFORMANCE],
      'caching-specialist',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.6,
  },

  {
    id: 'load-testing-engineer',
    name: 'Load Testing Engineer',
    emoji: '🎯',
    category: AGENT_CATEGORIES.PERFORMANCE,
    description:
      'Designs and executes comprehensive performance testing strategies',
    specialties: [
      'Load testing',
      'Stress testing',
      'Performance benchmarking',
      'Capacity testing',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.PERFORMANCE],
      'load-testing-engineer',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.6,
  },

  // ============= DATABASE & DATA =============
  {
    id: 'database-architect',
    name: 'Database Architect',
    emoji: '🏛️',
    category: AGENT_CATEGORIES.DATABASE,
    description:
      'Designs robust database architectures and data modeling strategies',
    specialties: [
      'Data modeling',
      'Database design',
      'Schema architecture',
      'Migration planning',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.DATABASE],
      'database-architect',
    ),
    suggestedTools: ['read_file', 'write_file', 'grep', 'web_fetch'],
    temperature: 0.6,
  },

  {
    id: 'data-engineer',
    name: 'Data Engineer',
    emoji: '🔧',
    category: AGENT_CATEGORIES.DATABASE,
    description: 'Builds scalable data pipelines and ETL/ELT processes',
    specialties: [
      'Data pipelines',
      'ETL/ELT',
      'Stream processing',
      'Data infrastructure',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.DATABASE],
      'data-engineer',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.6,
  },

  {
    id: 'data-analyst',
    name: 'Data Analyst',
    emoji: '📈',
    category: AGENT_CATEGORIES.DATABASE,
    description:
      'Transforms data into actionable business insights through analysis',
    specialties: [
      'Business intelligence',
      'Data visualization',
      'Statistical analysis',
      'Reporting',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.DATABASE],
      'data-analyst',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  {
    id: 'big-data-specialist',
    name: 'Big Data Specialist',
    emoji: '🌊',
    category: AGENT_CATEGORIES.DATABASE,
    description:
      'Handles massive datasets using distributed computing frameworks',
    specialties: [
      'Apache Spark',
      'Hadoop ecosystem',
      'Distributed computing',
      'Real-time processing',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.DATABASE],
      'big-data-specialist',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  {
    id: 'data-warehouse-architect',
    name: 'Data Warehouse Architect',
    emoji: '🏭',
    category: AGENT_CATEGORIES.DATABASE,
    description:
      'Designs enterprise data warehousing solutions and dimensional models',
    specialties: [
      'Dimensional modeling',
      'Data warehousing',
      'OLAP systems',
      'Analytics architecture',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.DATABASE],
      'data-warehouse-architect',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.6,
  },

  // ============= DEVOPS & INFRASTRUCTURE =============
  {
    id: 'devops-engineer',
    name: 'DevOps Engineer',
    emoji: '🔄',
    category: AGENT_CATEGORIES.DEVOPS,
    description: 'Implements CI/CD pipelines and infrastructure automation',
    specialties: [
      'CI/CD',
      'Infrastructure as code',
      'Automation',
      'Configuration management',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.DEVOPS],
      'devops-engineer',
    ),
    suggestedTools: [
      'read_file',
      'write_file',
      'run_shell_command',
      'web_fetch',
    ],
    temperature: 0.6,
  },

  {
    id: 'kubernetes-operator',
    name: 'Kubernetes Operator',
    emoji: '☸️',
    category: AGENT_CATEGORIES.DEVOPS,
    description: 'Manages container orchestration and cloud-native deployments',
    specialties: [
      'Kubernetes',
      'Container orchestration',
      'Helm charts',
      'Cloud-native',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.DEVOPS],
      'kubernetes-operator',
    ),
    suggestedTools: [
      'read_file',
      'write_file',
      'run_shell_command',
      'web_fetch',
    ],
    temperature: 0.6,
  },

  {
    id: 'cloud-engineer',
    name: 'Cloud Engineer',
    emoji: '⛅',
    category: AGENT_CATEGORIES.DEVOPS,
    description: 'Manages multi-cloud infrastructure and migration strategies',
    specialties: [
      'Cloud platforms',
      'Infrastructure automation',
      'Migration',
      'Cost optimization',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.DEVOPS],
      'cloud-engineer',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.6,
  },

  {
    id: 'infrastructure-architect',
    name: 'Infrastructure Architect',
    emoji: '🏗️',
    category: AGENT_CATEGORIES.DEVOPS,
    description:
      'Designs enterprise infrastructure and hybrid cloud architectures',
    specialties: [
      'Infrastructure design',
      'Enterprise architecture',
      'Hybrid cloud',
      'Network design',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.DEVOPS],
      'infrastructure-architect',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.6,
  },

  {
    id: 'site-reliability-engineer',
    name: 'Site Reliability Engineer',
    emoji: '🎯',
    category: AGENT_CATEGORIES.DEVOPS,
    description:
      'Ensures system reliability with SLOs, monitoring, and incident response',
    specialties: [
      'SRE practices',
      'Monitoring',
      'Incident response',
      'System reliability',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.DEVOPS],
      'site-reliability-engineer',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.6,
  },

  // ============= FRONTEND SPECIALISTS =============
  {
    id: 'react-specialist',
    name: 'React Specialist',
    emoji: '⚛️',
    category: AGENT_CATEGORIES.FRONTEND,
    description: 'Expert in modern React development and state management',
    specialties: [
      'React',
      'Hooks',
      'State management',
      'Performance optimization',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.FRONTEND],
      'react-specialist',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  {
    id: 'frontend-architect',
    name: 'Frontend Architect',
    emoji: '🏗️',
    category: AGENT_CATEGORIES.FRONTEND,
    description: 'Designs scalable frontend architectures and micro-frontends',
    specialties: [
      'Frontend architecture',
      'Micro-frontends',
      'Performance',
      'Scalability',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.FRONTEND],
      'frontend-architect',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  {
    id: 'ui-ux-developer',
    name: 'UI/UX Developer',
    emoji: '🎨',
    category: AGENT_CATEGORIES.FRONTEND,
    description:
      'Creates exceptional user interfaces with design system expertise',
    specialties: [
      'UI/UX design',
      'Design systems',
      'Accessibility',
      'User experience',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.FRONTEND],
      'ui-ux-developer',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  {
    id: 'mobile-developer',
    name: 'Mobile Developer',
    emoji: '📱',
    category: AGENT_CATEGORIES.FRONTEND,
    description: 'Develops cross-platform mobile applications',
    specialties: ['React Native', 'Flutter', 'Mobile UI', 'Cross-platform'],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.FRONTEND],
      'mobile-developer',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  {
    id: 'web-performance-specialist',
    name: 'Web Performance Specialist',
    emoji: '⚡',
    category: AGENT_CATEGORIES.FRONTEND,
    description: 'Optimizes web applications for speed and Core Web Vitals',
    specialties: [
      'Web performance',
      'Core Web Vitals',
      'Optimization',
      'Frontend performance',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.FRONTEND],
      'web-performance-specialist',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.6,
  },

  // ============= BACKEND SPECIALISTS =============
  {
    id: 'backend-architect',
    name: 'Backend Architect',
    emoji: '🏗️',
    category: AGENT_CATEGORIES.BACKEND,
    description: 'Designs scalable backend systems and API architectures',
    specialties: [
      'Backend architecture',
      'API design',
      'Scalability',
      'System integration',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.BACKEND],
      'backend-architect',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  {
    id: 'node-js-specialist',
    name: 'Node.js Specialist',
    emoji: '🟢',
    category: AGENT_CATEGORIES.BACKEND,
    description:
      'Builds high-performance Node.js applications with event-driven architecture',
    specialties: [
      'Node.js',
      'Event-driven architecture',
      'Async programming',
      'Real-time systems',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.BACKEND],
      'node-js-specialist',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  {
    id: 'python-specialist',
    name: 'Python Specialist',
    emoji: '🐍',
    category: AGENT_CATEGORIES.BACKEND,
    description:
      'Develops Python web services and data processing applications',
    specialties: [
      'Python',
      'Web frameworks',
      'Data processing',
      'API development',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.BACKEND],
      'python-specialist',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  {
    id: 'java-specialist',
    name: 'Java Specialist',
    emoji: '☕',
    category: AGENT_CATEGORIES.BACKEND,
    description:
      'Creates enterprise Java applications with Spring ecosystem expertise',
    specialties: [
      'Java',
      'Spring ecosystem',
      'Enterprise applications',
      'JVM optimization',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.BACKEND],
      'java-specialist',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  {
    id: 'go-specialist',
    name: 'Go Specialist',
    emoji: '🐹',
    category: AGENT_CATEGORIES.BACKEND,
    description: 'Builds concurrent systems and microservices with Go',
    specialties: [
      'Go programming',
      'Concurrency',
      'Microservices',
      'System programming',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.BACKEND],
      'go-specialist',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  // ============= SPECIALIZED DOMAINS =============
  {
    id: 'blockchain-developer',
    name: 'Blockchain Developer',
    emoji: '⛓️',
    category: AGENT_CATEGORIES.DOMAIN,
    description: 'Develops smart contracts and decentralized applications',
    specialties: ['Smart contracts', 'DApps', 'Web3', 'Blockchain protocols'],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.DOMAIN],
      'blockchain-developer',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.6,
  },

  {
    id: 'iot-specialist',
    name: 'IoT Specialist',
    emoji: '🌐',
    category: AGENT_CATEGORIES.DOMAIN,
    description: 'Creates connected device ecosystems and sensor networks',
    specialties: [
      'IoT architecture',
      'Sensor networks',
      'Device connectivity',
      'Edge computing',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.DOMAIN],
      'iot-specialist',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  {
    id: 'gamedev-specialist',
    name: 'Game Development Specialist',
    emoji: '🎮',
    category: AGENT_CATEGORIES.DOMAIN,
    description:
      'Creates games and interactive experiences with modern engines',
    specialties: [
      'Game engines',
      'Gameplay programming',
      'Graphics programming',
      'Game design',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.DOMAIN],
      'gamedev-specialist',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.8,
  },

  {
    id: 'iot-edge-specialist',
    name: 'IoT Edge Specialist',
    emoji: '📡',
    category: AGENT_CATEGORIES.DOMAIN,
    description:
      'Develops edge computing solutions for IoT and real-time processing',
    specialties: [
      'Edge computing',
      'Real-time processing',
      'Embedded systems',
      'IoT protocols',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.DOMAIN],
      'iot-edge-specialist',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  {
    id: 'embedded-systems-engineer',
    name: 'Embedded Systems Engineer',
    emoji: '🔌',
    category: AGENT_CATEGORIES.DOMAIN,
    description:
      'Programs embedded systems, firmware, and real-time applications',
    specialties: [
      'Embedded programming',
      'Firmware development',
      'Real-time systems',
      'Hardware integration',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.DOMAIN],
      'embedded-systems-engineer',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.6,
  },

  // ============= PROCESS & QUALITY =============
  {
    id: 'code-quality-analyst',
    name: 'Code Quality Analyst',
    emoji: '📏',
    category: AGENT_CATEGORIES.PROCESS,
    description:
      'Ensures code quality through static analysis and technical debt management',
    specialties: [
      'Static analysis',
      'Code metrics',
      'Technical debt',
      'Quality gates',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.PROCESS],
      'code-quality-analyst',
    ),
    suggestedTools: ['read_file', 'write_file', 'grep', 'web_fetch'],
    temperature: 0.6,
  },

  {
    id: 'test-automation-engineer',
    name: 'Test Automation Engineer',
    emoji: '🤖',
    category: AGENT_CATEGORIES.PROCESS,
    description:
      'Implements comprehensive test automation frameworks and strategies',
    specialties: [
      'Test automation',
      'Testing frameworks',
      'CI/CD integration',
      'Quality assurance',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.PROCESS],
      'test-automation-engineer',
    ),
    suggestedTools: [
      'read_file',
      'write_file',
      'run_shell_command',
      'web_fetch',
    ],
    temperature: 0.6,
  },

  {
    id: 'agile-coach',
    name: 'Agile Coach',
    emoji: '🏃',
    category: AGENT_CATEGORIES.PROCESS,
    description: 'Guides agile transformation and team development practices',
    specialties: [
      'Agile methodologies',
      'Team coaching',
      'Process improvement',
      'Scrum/Kanban',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.PROCESS],
      'agile-coach',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.7,
  },

  {
    id: 'project-manager',
    name: 'Project Manager',
    emoji: '📋',
    category: AGENT_CATEGORIES.PROCESS,
    description:
      'Manages software projects with focus on delivery and stakeholder communication',
    specialties: [
      'Project planning',
      'Stakeholder management',
      'Risk management',
      'Delivery coordination',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.PROCESS],
      'project-manager',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.6,
  },

  {
    id: 'qa-manager',
    name: 'QA Manager',
    emoji: '✅',
    category: AGENT_CATEGORIES.PROCESS,
    description: 'Leads quality assurance strategy and testing team management',
    specialties: [
      'QA strategy',
      'Testing leadership',
      'Quality processes',
      'Team management',
    ],
    systemPrompt: loadSystemPrompt(
      CATEGORY_DIRS[AGENT_CATEGORIES.PROCESS],
      'qa-manager',
    ),
    suggestedTools: ['read_file', 'write_file', 'web_fetch'],
    temperature: 0.6,
  },
];

export const AGENT_PERSONAS: AgentPersona[] = RAW_AGENT_PERSONAS.map(
  (persona) => ({
    ...persona,
    suggestedTools: CORE_TOOL_SUGGESTIONS,
  }),
);

// Helper function to get agents by category
export function getAgentsByCategory(category: string): AgentPersona[] {
  return AGENT_PERSONAS.filter((agent) => agent.category === category);
}

// Helper function to find agent by ID
export function getAgentById(id: string): AgentPersona | undefined {
  return AGENT_PERSONAS.find((agent) => agent.id === id);
}

// Helper function to search agents by specialty
export function searchAgentsBySpecialty(specialty: string): AgentPersona[] {
  const searchTerm = specialty.toLowerCase();
  return AGENT_PERSONAS.filter((agent) =>
    agent.specialties.some((s) => s.toLowerCase().includes(searchTerm)),
  );
}
