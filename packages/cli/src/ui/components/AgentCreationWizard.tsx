/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
// TextInput would be imported from ink-text-input when available
// For now, using Text as placeholder
const TextInput = ({ value, onChange }: any) => {
  // Placeholder implementation
  return <Text>{value || '(Enter text)'}</Text>;
};
import SelectInput from 'ink-select-input';
import { Colors } from '../colors.js';

/**
 * Wizard steps for agent creation
 */
enum WizardStep {
  NAME = 'name',
  DESCRIPTION = 'description',
  CATEGORY = 'category',
  TOOLS = 'tools',
  BEHAVIORS = 'behaviors',
  PROMPT_TEMPLATE = 'prompt_template',
  CUSTOM_PROMPT = 'custom_prompt',
  REVIEW = 'review',
  COMPLETE = 'complete'
}

/**
 * Tool capability options
 */
const TOOL_OPTIONS = [
  { label: 'File Operations', value: 'fileOperations' },
  { label: 'Shell Commands', value: 'shellCommands' },
  { label: 'Web Research', value: 'webResearch' },
  { label: 'Apple Control', value: 'appleControl' },
  { label: 'Email & Calendar', value: 'emailCalendar' },
  { label: 'Docker Management', value: 'dockerManagement' }
];

/**
 * Prompt templates for different agent types
 */
const PROMPT_TEMPLATES = {
  developer: `You are a specialized development assistant agent.

Your primary responsibilities:
- Write clean, maintainable, and well-documented code
- Follow best practices and design patterns
- Provide comprehensive testing strategies
- Ensure security and performance optimization
- Offer detailed explanations for technical decisions

Core principles:
- Prioritize code quality over speed
- Always consider edge cases and error handling
- Document complex logic thoroughly
- Use type safety when available
- Follow the project's existing conventions`,

  analyst: `You are a specialized data analyst agent.

Your primary responsibilities:
- Analyze data to extract meaningful insights
- Create clear visualizations and reports
- Identify trends and patterns
- Provide actionable recommendations
- Ensure data accuracy and integrity

Core principles:
- Base conclusions on solid evidence
- Present findings clearly and concisely
- Consider multiple perspectives
- Validate assumptions with data
- Maintain objectivity in analysis`,

  creative: `You are a specialized creative assistant agent.

Your primary responsibilities:
- Generate innovative ideas and concepts
- Provide multiple creative alternatives
- Think outside conventional boundaries
- Adapt tone and style to context
- Balance creativity with practicality

Core principles:
- Embrace unconventional thinking
- Provide diverse options
- Consider audience and context
- Iterate based on feedback
- Maintain originality`,

  researcher: `You are a specialized research assistant agent.

Your primary responsibilities:
- Conduct thorough information gathering
- Verify sources and citations
- Synthesize complex information
- Provide comprehensive summaries
- Maintain academic rigor

Core principles:
- Prioritize accuracy over speed
- Use credible sources
- Cross-reference information
- Present balanced viewpoints
- Document methodology`,

  automation: `You are a specialized automation agent.

Your primary responsibilities:
- Design efficient automated workflows
- Optimize repetitive processes
- Create robust error handling
- Ensure scalability and maintainability
- Document automation logic clearly

Core principles:
- Focus on reliability
- Build idempotent operations
- Include comprehensive logging
- Plan for failure scenarios
- Optimize for performance`,

  custom: ''
};

/**
 * Special behavior options
 */
const BEHAVIOR_OPTIONS = [
  'Proactive suggestions',
  'Detailed explanations',
  'Code review focus',
  'Testing emphasis',
  'Security awareness',
  'Performance optimization',
  'Documentation generation',
  'Error prevention',
  'Best practices enforcement',
  'Learning from feedback'
];

interface AgentCreationWizardProps {
  onComplete: (agentConfig: any) => void;
  onCancel: () => void;
}

/**
 * Agent creation wizard component
 */
export const AgentCreationWizard: React.FC<AgentCreationWizardProps> = ({
  onComplete,
  onCancel
}) => {
  // const { exit } = useApp(); // Commented out - not used currently
  const [currentStep, setCurrentStep] = useState<WizardStep>(WizardStep.NAME);
  const [agentConfig, setAgentConfig] = useState({
    name: '',
    description: '',
    category: 'custom' as const,
    author: 'User',
    version: '1.0.0',
    tools: [] as string[],
    behaviors: [] as string[],
    promptTemplate: 'custom',
    systemPrompt: ''
  });

  // Input states for text fields
  const [nameInput, setNameInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [customPromptInput, setCustomPromptInput] = useState('');
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [selectedBehaviors, setSelectedBehaviors] = useState<Set<string>>(new Set());

  useInput((input, key) => {
    // Global shortcuts
    if (key.escape) {
      onCancel();
      return;
    }

    // Step-specific shortcuts
    switch (currentStep) {
      case WizardStep.TOOLS:
        if (input === ' ') {
          // Space to toggle tool selection
          // Handled in tool selection component
        }
        break;

      case WizardStep.BEHAVIORS:
        if (input === ' ') {
          // Space to toggle behavior selection
          // Handled in behavior selection component
        }
        break;

      case WizardStep.REVIEW:
        if (key.return) {
          handleComplete();
        }
        break;
    }
  });

  const handleNextStep = useCallback(() => {
    switch (currentStep) {
      case WizardStep.NAME:
        if (nameInput.trim()) {
          setAgentConfig(prev => ({ ...prev, name: nameInput.trim() }));
          setCurrentStep(WizardStep.DESCRIPTION);
        }
        break;

      case WizardStep.DESCRIPTION:
        if (descriptionInput.trim()) {
          setAgentConfig(prev => ({ ...prev, description: descriptionInput.trim() }));
          setCurrentStep(WizardStep.CATEGORY);
        }
        break;

      case WizardStep.CATEGORY:
        setCurrentStep(WizardStep.TOOLS);
        break;

      case WizardStep.TOOLS:
        setAgentConfig(prev => ({ ...prev, tools: Array.from(selectedTools) }));
        setCurrentStep(WizardStep.BEHAVIORS);
        break;

      case WizardStep.BEHAVIORS:
        setAgentConfig(prev => ({ ...prev, behaviors: Array.from(selectedBehaviors) }));
        setCurrentStep(WizardStep.PROMPT_TEMPLATE);
        break;

      case WizardStep.PROMPT_TEMPLATE:
        if (agentConfig.promptTemplate === 'custom') {
          setCurrentStep(WizardStep.CUSTOM_PROMPT);
        } else {
          setAgentConfig(prev => ({
            ...prev,
            systemPrompt: PROMPT_TEMPLATES[agentConfig.promptTemplate as keyof typeof PROMPT_TEMPLATES]
          }));
          setCurrentStep(WizardStep.REVIEW);
        }
        break;

      case WizardStep.CUSTOM_PROMPT:
        if (customPromptInput.trim()) {
          setAgentConfig(prev => ({ ...prev, systemPrompt: customPromptInput.trim() }));
          setCurrentStep(WizardStep.REVIEW);
        }
        break;

      case WizardStep.REVIEW:
        handleComplete();
        break;
    }
  }, [currentStep, nameInput, descriptionInput, selectedTools, selectedBehaviors, customPromptInput, agentConfig]);

  const handleComplete = useCallback(() => {
    const completeConfig = {
      id: `custom-${agentConfig.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      name: agentConfig.name,
      version: agentConfig.version,
      category: 'custom' as const,
      description: agentConfig.description,
      author: agentConfig.author,
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      systemPrompt: agentConfig.systemPrompt,
      capabilities: {
        tools: {
          fileOperations: agentConfig.tools.includes('fileOperations'),
          shellCommands: agentConfig.tools.includes('shellCommands'),
          webResearch: agentConfig.tools.includes('webResearch'),
          appleControl: agentConfig.tools.includes('appleControl'),
          emailCalendar: agentConfig.tools.includes('emailCalendar'),
          dockerManagement: agentConfig.tools.includes('dockerManagement')
        },
        specialBehaviors: agentConfig.behaviors
      },
      toolConfiguration: {
        enabledTools: agentConfig.tools,
        customToolOptions: {}
      },
      metadata: {
        usageCount: 0,
        lastUsed: null,
        effectiveness: 0.8,
        userRating: 4.0
      }
    };

    setCurrentStep(WizardStep.COMPLETE);
    onComplete(completeConfig);
  }, [agentConfig, onComplete]);

  const renderStepIndicator = () => {
    const steps = [
      { key: WizardStep.NAME, label: 'Name' },
      { key: WizardStep.DESCRIPTION, label: 'Description' },
      { key: WizardStep.CATEGORY, label: 'Category' },
      { key: WizardStep.TOOLS, label: 'Tools' },
      { key: WizardStep.BEHAVIORS, label: 'Behaviors' },
      { key: WizardStep.PROMPT_TEMPLATE, label: 'Prompt' },
      { key: WizardStep.REVIEW, label: 'Review' }
    ];

    const currentIndex = steps.findIndex(s => s.key === currentStep);

    return (
      <Box marginBottom={1}>
        <Text color={Colors.AccentBlue} bold>
          Step {currentIndex + 1} of {steps.length}: {steps[currentIndex]?.label}
        </Text>
        <Box marginLeft={2}>
          {steps.map((step, index) => (
            <Text
              key={step.key}
              color={
                index < currentIndex
                  ? Colors.AccentGreen
                  : index === currentIndex
                  ? Colors.AccentYellow
                  : Colors.Gray
              }
            >
              {index < currentIndex ? '✓' : index === currentIndex ? '●' : '○'}
            </Text>
          ))}
        </Box>
      </Box>
    );
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case WizardStep.NAME:
        return (
          <Box flexDirection="column">
            <Text color={Colors.AccentPurple} bold>Agent Name:</Text>
            <Text color={Colors.Gray}>Choose a descriptive name for your agent</Text>
            <Box marginTop={1}>
              <Text color={Colors.AccentBlue}>Name: </Text>
              <TextInput
                value={nameInput}
                onChange={setNameInput}
                onSubmit={handleNextStep}
                placeholder="e.g., Code Reviewer, Data Analyst"
              />
            </Box>
          </Box>
        );

      case WizardStep.DESCRIPTION:
        return (
          <Box flexDirection="column">
            <Text color={Colors.AccentPurple} bold>Agent Description:</Text>
            <Text color={Colors.Gray}>Describe what your agent specializes in</Text>
            <Box marginTop={1}>
              <Text color={Colors.AccentBlue}>Description: </Text>
              <TextInput
                value={descriptionInput}
                onChange={setDescriptionInput}
                onSubmit={handleNextStep}
                placeholder="e.g., Specializes in code review and quality assurance"
              />
            </Box>
          </Box>
        );

      case WizardStep.CATEGORY:
        return (
          <Box flexDirection="column">
            <Text color={Colors.AccentPurple} bold>Agent Category:</Text>
            <Text color={Colors.Gray}>This will be set to 'custom' for user-created agents</Text>
            <Box marginTop={1}>
              <Text color={Colors.AccentGreen}>✓ Category: custom</Text>
            </Box>
            <Box marginTop={1}>
              <Text color={Colors.Gray}>Press ENTER to continue</Text>
            </Box>
          </Box>
        );

      case WizardStep.TOOLS:
        return (
          <Box flexDirection="column">
            <Text color={Colors.AccentPurple} bold>Select Tools:</Text>
            <Text color={Colors.Gray}>Choose which tools your agent can use (SPACE to toggle, ENTER when done)</Text>
            <Box marginTop={1} flexDirection="column">
              <SelectInput
                items={TOOL_OPTIONS.map(tool => ({
                  label: `${selectedTools.has(tool.value) ? '[X]' : '[ ]'} ${tool.label}`,
                  value: tool.value
                }))}
                onSelect={(item) => {
                  const newTools = new Set(selectedTools);
                  if (newTools.has(item.value)) {
                    newTools.delete(item.value);
                  } else {
                    newTools.add(item.value);
                  }
                  setSelectedTools(newTools);
                }}
              />
            </Box>
            <Box marginTop={1}>
              <Text color={Colors.Gray}>Selected: {selectedTools.size} tools</Text>
            </Box>
          </Box>
        );

      case WizardStep.BEHAVIORS:
        return (
          <Box flexDirection="column">
            <Text color={Colors.AccentPurple} bold>Special Behaviors:</Text>
            <Text color={Colors.Gray}>Select behaviors for your agent (SPACE to toggle, ENTER when done)</Text>
            <Box marginTop={1} flexDirection="column">
              <SelectInput
                items={BEHAVIOR_OPTIONS.map(behavior => ({
                  label: `${selectedBehaviors.has(behavior) ? '[X]' : '[ ]'} ${behavior}`,
                  value: behavior
                }))}
                onSelect={(item) => {
                  const newBehaviors = new Set(selectedBehaviors);
                  if (newBehaviors.has(item.value)) {
                    newBehaviors.delete(item.value);
                  } else {
                    newBehaviors.add(item.value);
                  }
                  setSelectedBehaviors(newBehaviors);
                }}
              />
            </Box>
            <Box marginTop={1}>
              <Text color={Colors.Gray}>Selected: {selectedBehaviors.size} behaviors</Text>
            </Box>
          </Box>
        );

      case WizardStep.PROMPT_TEMPLATE:
        return (
          <Box flexDirection="column">
            <Text color={Colors.AccentPurple} bold>System Prompt Template:</Text>
            <Text color={Colors.Gray}>Choose a template or create custom prompt</Text>
            <Box marginTop={1}>
              <SelectInput
                items={[
                  { label: 'Developer Assistant', value: 'developer' },
                  { label: 'Data Analyst', value: 'analyst' },
                  { label: 'Creative Assistant', value: 'creative' },
                  { label: 'Research Assistant', value: 'researcher' },
                  { label: 'Automation Specialist', value: 'automation' },
                  { label: 'Custom (Write your own)', value: 'custom' }
                ]}
                onSelect={(item) => {
                  setAgentConfig(prev => ({ ...prev, promptTemplate: item.value }));
                  handleNextStep();
                }}
              />
            </Box>
          </Box>
        );

      case WizardStep.CUSTOM_PROMPT:
        return (
          <Box flexDirection="column">
            <Text color={Colors.AccentPurple} bold>Custom System Prompt:</Text>
            <Text color={Colors.Gray}>Write your agent's system prompt (CTRL+D when done)</Text>
            <Box marginTop={1} flexDirection="column">
              <TextInput
                value={customPromptInput}
                onChange={setCustomPromptInput}
                onSubmit={handleNextStep}
                placeholder="Enter your custom system prompt..."
              />
            </Box>
            <Box marginTop={1}>
              <Text color={Colors.Gray}>
                Tip: Define the agent's role, responsibilities, and principles
              </Text>
            </Box>
          </Box>
        );

      case WizardStep.REVIEW:
        return (
          <Box flexDirection="column">
            <Text color={Colors.AccentPurple} bold>Review Your Agent:</Text>
            <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor={Colors.AccentBlue} paddingX={1}>
              <Text color={Colors.AccentGreen}>Name: {agentConfig.name}</Text>
              <Text color={Colors.AccentYellow}>Description: {agentConfig.description}</Text>
              <Text color={Colors.AccentBlue}>Category: {agentConfig.category}</Text>
              <Text color={Colors.AccentPurple}>Tools: {agentConfig.tools.join(', ') || 'None'}</Text>
              <Text color={Colors.AccentRed}>Behaviors: {agentConfig.behaviors.length} selected</Text>
              <Text color={Colors.Gray}>Prompt: {agentConfig.promptTemplate === 'custom' ? 'Custom' : agentConfig.promptTemplate}</Text>
            </Box>
            <Box marginTop={1}>
              <Text color={Colors.AccentGreen}>Press ENTER to create agent or ESC to cancel</Text>
            </Box>
          </Box>
        );

      case WizardStep.COMPLETE:
        return (
          <Box flexDirection="column">
            <Text color={Colors.AccentGreen} bold>✅ Agent Created Successfully!</Text>
            <Box marginTop={1}>
              <Text color={Colors.AccentBlue}>Your agent "{agentConfig.name}" has been created.</Text>
            </Box>
            <Box marginTop={1}>
              <Text color={Colors.Gray}>Use /agent activate {`custom-${agentConfig.name.toLowerCase().replace(/\s+/g, '-')}`} to activate it</Text>
            </Box>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={Colors.AccentPurple}
        paddingX={2}
        paddingY={1}
      >
        <Text color={Colors.AccentPurple} bold>
          🧙 AGENT CREATION WIZARD
        </Text>
        
        {currentStep !== WizardStep.COMPLETE && (
          <>
            <Box marginTop={1}>
              {renderStepIndicator()}
            </Box>
            
            <Box marginTop={1}>
              {renderCurrentStep()}
            </Box>
            
            <Box marginTop={2} justifyContent="space-between">
              <Text color={Colors.Gray}>ESC to cancel</Text>
              <Text color={Colors.AccentGreen}>
                {currentStep === WizardStep.REVIEW ? 'ENTER to create' : 'ENTER to continue'}
              </Text>
            </Box>
          </>
        )}
        
        {currentStep === WizardStep.COMPLETE && renderCurrentStep()}
      </Box>
    </Box>
  );
};

/**
 * Prompt engineering helper component
 */
export const PromptEngineeringHelper: React.FC<{
  onSuggestion: (suggestion: string) => void;
}> = ({ onSuggestion }) => {
  const suggestions = [
    'Define clear role and responsibilities',
    'Specify output format requirements',
    'Include error handling instructions',
    'Add context awareness guidelines',
    'Set communication style preferences',
    'Define decision-making criteria',
    'Include learning and adaptation rules',
    'Specify tool usage guidelines'
  ];

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={Colors.AccentYellow} bold>💡 Prompt Engineering Tips:</Text>
      <Box flexDirection="column" marginLeft={2}>
        {suggestions.map((suggestion, index) => (
          <Text key={index} color={Colors.Gray}>
            • {suggestion}
          </Text>
        ))}
      </Box>
    </Box>
  );
};