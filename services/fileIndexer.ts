/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { type IndexedImage, type ImageMetadata, type InvokeAIMetadata, type Automatic1111Metadata, type ComfyUIMetadata, type BaseMetadata, isInvokeAIMetadata, isAutomatic1111Metadata, isComfyUIMetadata } from '../types';
import { parse } from 'exifr';

// Function to extract models from metadata
function extractModels(metadata: ImageMetadata): string[] {
  // Log metadata format detection
  // Debug logging removed for performance - only log errors and critical issues

  // First check if normalized metadata is available (faster path)
  if ('normalizedMetadata' in metadata && metadata.normalizedMetadata) {
    const normalized = metadata.normalizedMetadata;
    if (normalized.models && Array.isArray(normalized.models)) {
      // Debug logging removed for performance
      return normalized.models;
    }
  }

  // Fallback to format-specific extraction
  const models: string[] = [];

  // Handle InvokeAI metadata
  if (isInvokeAIMetadata(metadata)) {
    // Debug logging removed for performance
    return extractModelsFromInvokeAI(metadata);
  }

  // Handle Automatic1111 metadata
  if (isAutomatic1111Metadata(metadata)) {
    // Debug logging removed for performance
    return extractModelsFromAutomatic1111(metadata);
  }

  // Handle ComfyUI metadata
  if (isComfyUIMetadata(metadata)) {
    // Debug logging removed for performance
    return extractModelsFromComfyUI(metadata);
  }

  // SPECIAL CASE: If we have normalizedMetadata but couldn't detect format,
  // it might be a cached ComfyUI image. Try to extract from normalizedMetadata directly
  if (metadata && typeof metadata === 'object' && 'normalizedMetadata' in metadata && (metadata as any).normalizedMetadata) {
    const normalized = (metadata as any).normalizedMetadata;
    // Debug logging removed for performance
    if (normalized.models && Array.isArray(normalized.models)) {
      return normalized.models;
    }
    // Try to extract from the original metadata if it exists in normalizedMetadata
    if (normalized.model && typeof normalized.model === 'string') {
      return [normalized.model];
    }
  }

  // Fallback: try to extract from raw metadata for unknown formats
  // Debug logging removed for performance
  return extractModelsFromRawMetadata(metadata);
}

// Extract models from InvokeAI metadata
function extractModelsFromInvokeAI(metadata: InvokeAIMetadata): string[] {
  const models: string[] = [];

  // Add main model
  if (metadata.model) {
    const modelName = extractModelName(metadata.model);
    if (modelName) models.push(modelName);
  }

  // Check for additional models in other fields
  if (metadata.base_model) {
    const modelName = extractModelName(metadata.base_model);
    if (modelName) models.push(modelName);
  }

  // Look for model names in metadata
  if (metadata.model_name) {
    const modelName = extractModelName(metadata.model_name);
    if (modelName) models.push(modelName);
  }

  // Check for checkpoint/safetensors files in metadata
  const metadataStr = JSON.stringify(metadata).toLowerCase();
  const modelMatches = metadataStr.match(/['"]\s*([^'"]*\.safetensors|[^'"]*\.ckpt|[^'"]*\.pt)\s*['"]/g);
  if (modelMatches) {
    modelMatches.forEach(match => {
      let modelName = match.replace(/['"]/g, '').trim();
      // Extract just the filename without path
      modelName = modelName.split('/').pop() || modelName;
      modelName = modelName.split('\\').pop() || modelName;
      if (modelName && !models.includes(modelName)) {
        models.push(modelName);
      }
    });
  }

  return models.filter(Boolean);
}

// Extract models from Automatic1111 metadata
function extractModelsFromAutomatic1111(metadata: Automatic1111Metadata): string[] {
  const models: string[] = [];
  const params = metadata.parameters;

  // Look for "Model:" or "Model hash:" patterns in the parameters string
  const modelMatch = params.match(/Model:\s*([^,\n]+)/i);
  if (modelMatch) {
    const modelName = modelMatch[1].trim();
    if (modelName) models.push(modelName);
  }

  // Also check for model hash pattern
  const hashMatch = params.match(/Model hash:\s*([a-f0-9]+)/i);
  if (hashMatch) {
    const hash = hashMatch[1].trim();
    // If we have a hash but no model name, use the hash as identifier
    if (models.length === 0) {
      models.push(`Model (${hash.substring(0, 8)}...)`);
    }
  }

  return models;
}

// Extract models from ComfyUI metadata
function extractModelsFromComfyUI(metadata: ComfyUIMetadata): string[] {
  const models: string[] = [];

  try {
    // Parse workflow if it's a string
    let workflow: any = metadata.workflow;
    if (typeof workflow === 'string') {
      workflow = JSON.parse(workflow);
    }

    // Parse prompt if it's a string
    let prompt: any = metadata.prompt;
    if (typeof prompt === 'string') {
      prompt = JSON.parse(prompt);
    }

    // Look for model information in workflow nodes
    if (workflow && workflow.nodes) {
      for (const node of workflow.nodes) {
        if (node.type && node.type.toLowerCase().includes('checkpoint') ||
            node.type && node.type.toLowerCase().includes('model')) {
          // Check widgets_values for model name
          if (node.widgets_values && node.widgets_values.length > 0) {
            const modelName = node.widgets_values[0];
            if (typeof modelName === 'string' && modelName.trim()) {
              models.push(modelName.trim());
            }
          }
          // Check inputs for model information
          if (node.inputs) {
            for (const [key, value] of Object.entries(node.inputs)) {
              if (key.toLowerCase().includes('ckpt_name') || key.toLowerCase().includes('model')) {
                if (typeof value === 'string' && value.trim()) {
                  models.push(value.trim());
                }
              }
            }
          }
        }
      }
    }

    // Look for model information in prompt
    if (prompt) {
      for (const [nodeId, nodeData] of Object.entries(prompt)) {
        const node = nodeData as any;
        if (node.class_type && node.class_type.toLowerCase().includes('checkpoint')) {
          if (node.inputs) {
            for (const [key, value] of Object.entries(node.inputs)) {
              if (key.toLowerCase().includes('ckpt_name') || key.toLowerCase().includes('model')) {
                if (typeof value === 'string' && value.trim()) {
                  models.push(value.trim());
                }
              }
            }
          }
        }
      }
    }

  } catch (error) {
    console.warn('Failed to parse ComfyUI workflow/prompt for model extraction:', error);
  }

  return models.filter(Boolean);
}

// Fallback function to extract models from raw metadata for unknown formats
function extractModelsFromRawMetadata(metadata: any): string[] {
  const models: string[] = [];

  // Try common model field names across different formats
  const possibleModelFields = ['model', 'model_name', 'ckpt_name', 'checkpoint', 'model_hash'];

  for (const field of possibleModelFields) {
    if (metadata[field]) {
      const modelName = extractModelName(metadata[field]);
      if (modelName) models.push(modelName);
    }
  }

  // Try to extract from nested objects (ComfyUI style)
  if (metadata.workflow?.nodes) {
    for (const node of metadata.workflow.nodes) {
      if (node.class_type === 'CheckpointLoaderSimple' && node.inputs?.ckpt_name) {
        const modelName = extractModelName(node.inputs.ckpt_name);
        if (modelName) models.push(modelName);
      }
    }
  }

  return models;
}

// Helper function to extract readable model name
function extractModelName(modelData: any): string | null {
  if (typeof modelData === 'string') {
    return modelData.trim();
  }

  if (modelData && typeof modelData === 'object') {
    // Try to extract a readable name from the model object
    const possibleNames = [
      modelData.name,
      modelData.model,
      modelData.model_name,
      modelData.base_model,
      modelData.mechanism,
      modelData.type
    ];

    for (const name of possibleNames) {
      if (name && typeof name === 'string' && name.trim()) {
        return name.trim();
      }
    }

    // If all else fails, use key but make it more readable
    if (modelData.key && typeof modelData.key === 'string') {
      const key = modelData.key.trim();
      // If it's a long hash, truncate it
      if (key.length > 20 && /^[a-f0-9\-]+$/i.test(key)) {
        const mechanism = modelData.mechanism || modelData.type || 'Model';
        return `${mechanism} (${key.substring(0, 8)}...)`;
      }
      return key;
    }
  }

  return null;
}

// Function to extract LoRAs from metadata
function extractLoras(metadata: ImageMetadata): string[] {
  // First check if normalized metadata is available (faster path)
  if ('normalizedMetadata' in metadata && metadata.normalizedMetadata) {
    const normalized = metadata.normalizedMetadata;
    if (normalized.loras && Array.isArray(normalized.loras)) {
      // Debug logging removed for performance
      return normalized.loras;
    }
  }

  // Fallback to format-specific extraction
  const loras: string[] = [];

  // Handle InvokeAI metadata
  if (isInvokeAIMetadata(metadata)) {
    return extractLorasFromInvokeAI(metadata);
  }

  // Handle Automatic1111 metadata
  if (isAutomatic1111Metadata(metadata)) {
    return extractLorasFromAutomatic1111(metadata);
  }

  // Handle ComfyUI metadata
  if (isComfyUIMetadata(metadata)) {
    return extractLorasFromComfyUI(metadata);
  }

  // Fallback: try to extract from raw metadata for unknown formats
  // Debug logging removed for performance
  return extractLorasFromRawMetadata(metadata);
}

// Extract LoRAs from InvokeAI metadata
function extractLorasFromInvokeAI(metadata: InvokeAIMetadata): string[] {
  const loras: string[] = [];

  // Get prompt text
  const promptText = typeof metadata.prompt === 'string'
    ? metadata.prompt
    : Array.isArray(metadata.prompt)
      ? metadata.prompt.map(p => typeof p === 'string' ? p : p.prompt).join(' ')
      : '';

  // Common LoRA patterns in prompts
  const loraPatterns = [
    /<lora:([^:>]+):[^>]*>/gi,  // <lora:name:weight>
    /<lyco:([^:>]+):[^>]*>/gi,  // <lyco:name:weight>
    /\blora:([^\s,>]+)/gi,      // lora:name
    /\blyco:([^\s,>]+)/gi       // lyco:name
  ];

  loraPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(promptText)) !== null) {
      const loraName = match[1].trim();
      if (loraName && !loras.includes(loraName)) {
        loras.push(loraName);
      }
    }
  });

  // Also check metadata for LoRA fields
  if (metadata.loras && Array.isArray(metadata.loras)) {
    metadata.loras.forEach((lora: any) => {
      let loraName = '';

      if (typeof lora === 'string') {
        loraName = lora.trim();
      } else if (lora && typeof lora === 'object') {
        // First check direct string properties
        const directNames = [lora.name, lora.model_name, lora.key];

        // Then check if model is an object with name properties
        if (lora.model && typeof lora.model === 'object') {
          directNames.push(lora.model.name, lora.model.model, lora.model.model_name, lora.model.key);
        } else if (lora.model && typeof lora.model === 'string') {
          directNames.push(lora.model);
        }

        for (const name of directNames) {
          if (name && typeof name === 'string' && name.trim().length > 0) {
            loraName = name.trim();
            break;
          }
        }

        // If still no valid name found, skip this lora
        if (!loraName) {
          return;
        }
      }

      // Basic validation - avoid empty strings and [object Object]
      if (loraName &&
          loraName.length > 0 &&
          loraName !== '[object Object]' &&
          !loras.includes(loraName)) {
        loras.push(loraName);
      }
    });
  }

  // Check for LoRA in other common metadata fields
  if (metadata.lora) {
    let loraName = '';

    if (typeof metadata.lora === 'string') {
      loraName = metadata.lora.trim();
    } else if (metadata.lora && typeof metadata.lora === 'object') {
      loraName = metadata.lora.name || metadata.lora.model || metadata.lora.key;
      if (typeof loraName !== 'string') {
        loraName = metadata.lora.key || JSON.stringify(metadata.lora);
      }
    }

    if (loraName && loraName.length > 0 && !loras.includes(loraName)) {
      loras.push(loraName);
    }
  }

  return loras.filter(Boolean);
}

// Extract LoRAs from Automatic1111 metadata
function extractLorasFromAutomatic1111(metadata: Automatic1111Metadata): string[] {
  const loras: string[] = [];
  const params = metadata.parameters;

  // Look for LoRA patterns in the parameters string
  // Common formats: <lora:name:weight>, <lyco:name:weight>
  const loraPatterns = [
    /<lora:([^:>]+):[^>]*>/gi,
    /<lyco:([^:>]+):[^>]*>/gi
  ];

  loraPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(params)) !== null) {
      const loraName = match[1].trim();
      if (loraName && !loras.includes(loraName)) {
        loras.push(loraName);
      }
    }
  });

  return loras;
}

// Extract LoRAs from ComfyUI metadata
function extractLorasFromComfyUI(metadata: ComfyUIMetadata): string[] {
  const loras: string[] = [];

  try {
    // Parse workflow if it's a string
    let workflow: any = metadata.workflow;
    if (typeof workflow === 'string') {
      workflow = JSON.parse(workflow);
    }

    // Parse prompt if it's a string
    let prompt: any = metadata.prompt;
    if (typeof prompt === 'string') {
      prompt = JSON.parse(prompt);
    }

    // Look for LoRA information in workflow nodes
    if (workflow && workflow.nodes) {
      for (const node of workflow.nodes) {
        if (node.type && (node.type.toLowerCase().includes('lora') || node.type.toLowerCase().includes('lyco'))) {
          // Check widgets_values for LoRA name
          if (node.widgets_values && node.widgets_values.length > 0) {
            const loraName = node.widgets_values[0];
            if (typeof loraName === 'string' && loraName.trim()) {
              loras.push(loraName.trim());
            }
          }
          // Check inputs for LoRA information
          if (node.inputs) {
            for (const [key, value] of Object.entries(node.inputs)) {
              if (key.toLowerCase().includes('lora_name') || key.toLowerCase().includes('lyco_name')) {
                if (typeof value === 'string' && value.trim()) {
                  loras.push(value.trim());
                }
              }
            }
          }
        }
      }
    }

    // Look for LoRA information in prompt
    if (prompt) {
      for (const [nodeId, nodeData] of Object.entries(prompt)) {
        const node = nodeData as any;
        if (node.class_type && (node.class_type.toLowerCase().includes('lora') || node.class_type.toLowerCase().includes('lyco'))) {
          if (node.inputs) {
            for (const [key, value] of Object.entries(node.inputs)) {
              if (key.toLowerCase().includes('lora_name') || key.toLowerCase().includes('lyco_name')) {
                if (typeof value === 'string' && value.trim()) {
                  loras.push(value.trim());
                }
              }
            }
          }
        }
      }
    }

  } catch (error) {
    console.warn('Failed to parse ComfyUI workflow/prompt for LoRA extraction:', error);
  }

  return loras.filter(Boolean);
}

// Fallback function to extract LoRAs from raw metadata for unknown formats
function extractLorasFromRawMetadata(metadata: any): string[] {
  const loras: string[] = [];

  // Try common LoRA field names across different formats
  const possibleLoraFields = ['loras', 'lora', 'lora_name', 'lyco', 'lyco_name'];

  for (const field of possibleLoraFields) {
    if (metadata[field]) {
      if (Array.isArray(metadata[field])) {
        loras.push(...metadata[field].filter((l: any) => typeof l === 'string' && l.trim()));
      } else if (typeof metadata[field] === 'string') {
        loras.push(metadata[field].trim());
      }
    }
  }

  // Try to extract from nested objects (ComfyUI style)
  if (metadata.workflow?.nodes) {
    for (const node of metadata.workflow.nodes) {
      if (node.class_type && (node.class_type.toLowerCase().includes('lora') || node.class_type.toLowerCase().includes('lyco'))) {
        if (node.inputs?.lora_name) {
          loras.push(node.inputs.lora_name);
        }
      }
    }
  }

  return loras;
}

// Function to extract scheduler from metadata
function extractScheduler(metadata: ImageMetadata): string {
  // First check if normalized metadata is available (faster path)
  if ('normalizedMetadata' in metadata && metadata.normalizedMetadata) {
    const normalized = metadata.normalizedMetadata;
    if (normalized.scheduler) {
      // Debug logging removed for performance
      return normalized.scheduler;
    }
  }

  // Fallback to format-specific extraction
  // Handle InvokeAI metadata
  if (isInvokeAIMetadata(metadata)) {
    return metadata.scheduler || 'Unknown';
  }

  // Handle Automatic1111 metadata
  if (isAutomatic1111Metadata(metadata)) {
    return extractSchedulerFromAutomatic1111(metadata);
  }

  // Handle ComfyUI metadata
  if (isComfyUIMetadata(metadata)) {
    return extractSchedulerFromComfyUI(metadata);
  }

  // Fallback: try to extract from raw metadata for unknown formats
  // Debug logging removed for performance
  return extractSchedulerFromRawMetadata(metadata);
}

// Extract scheduler from Automatic1111 metadata
function extractSchedulerFromAutomatic1111(metadata: Automatic1111Metadata): string {
  const params = metadata.parameters;

  // Look for "Sampler:" pattern in the parameters string
  const samplerMatch = params.match(/Sampler:\s*([^,\n]+)/i);
  if (samplerMatch) {
    return samplerMatch[1].trim();
  }

  return 'Unknown';
}

// Extract scheduler from ComfyUI metadata
function extractSchedulerFromComfyUI(metadata: ComfyUIMetadata): string {
  try {
    // Parse prompt if it's a string
    let prompt: any = metadata.prompt;
    if (typeof prompt === 'string') {
      prompt = JSON.parse(prompt);
    }

    // Look for sampler/scheduler information in prompt
    if (prompt) {
      for (const [nodeId, nodeData] of Object.entries(prompt)) {
        const node = nodeData as any;
        if (node.class_type && node.class_type.toLowerCase().includes('sampler')) {
          if (node.inputs) {
            // Look for sampler_name or scheduler input
            const samplerName = node.inputs.sampler_name || node.inputs.scheduler;
            if (typeof samplerName === 'string' && samplerName.trim()) {
              return samplerName.trim();
            }
          }
        }
      }
    }

  } catch (error) {
    console.warn('Failed to parse ComfyUI prompt for scheduler extraction:', error);
  }

  return 'Unknown';
}

// Fallback function to extract scheduler from raw metadata for unknown formats
function extractSchedulerFromRawMetadata(metadata: any): string {
  // Try common scheduler field names across different formats
  const possibleSchedulerFields = ['scheduler', 'sampler', 'sampler_name', 'sampling_method'];

  for (const field of possibleSchedulerFields) {
    if (metadata[field] && typeof metadata[field] === 'string') {
      return metadata[field].trim();
    }
  }

  // Try to extract from nested objects (ComfyUI style)
  if (metadata.workflow?.nodes) {
    for (const node of metadata.workflow.nodes) {
      if (node.class_type && node.class_type.toLowerCase().includes('sampler')) {
        if (node.inputs?.sampler_name) {
          return node.inputs.sampler_name;
        }
      }
    }
  }

  return 'Unknown';
}

// Function to extract board information from metadata
function extractBoard(metadata: ImageMetadata): string {
  // Handle InvokeAI metadata (only format that currently supports boards)
  if (isInvokeAIMetadata(metadata)) {
    return extractBoardFromInvokeAI(metadata);
  }

  // Automatic1111 and ComfyUI don't have board concepts, so return uncategorized
  return 'Uncategorized';
}

// Extract board information from InvokeAI metadata
function extractBoardFromInvokeAI(metadata: InvokeAIMetadata): string {
  // Check for board_name first (most common)
  if (metadata.board_name && typeof metadata.board_name === 'string') {
    return metadata.board_name.trim();
  }

  // Check for board_id as fallback
  if (metadata.board_id && typeof metadata.board_id === 'string') {
    return metadata.board_id.trim();
  }

  // Check different case variations
  if (metadata.boardName && typeof metadata.boardName === 'string') {
    return metadata.boardName.trim();
  }

  if (metadata.boardId && typeof metadata.boardId === 'string') {
    return metadata.boardId.trim();
  }

  // Check for 'Board Name' with space
  if (metadata['Board Name'] && typeof metadata['Board Name'] === 'string') {
    return metadata['Board Name'].trim();
  }

  // Check for board object
  if (metadata.board && typeof metadata.board === 'object') {
    const boardObj = metadata.board as any;
    if (boardObj.name) return boardObj.name;
    if (boardObj.board_name) return boardObj.board_name;
    if (boardObj.id) return boardObj.id;
  }

  // Check for board as direct string
  if (metadata.board && typeof metadata.board === 'string') {
    return metadata.board.trim();
  }

  // NEW: Check canvas_v2_metadata for board information
  if (metadata.canvas_v2_metadata && typeof metadata.canvas_v2_metadata === 'object') {
    const canvasData = metadata.canvas_v2_metadata as any;
    // console.log('🔍 FULL canvas_v2_metadata:', JSON.stringify(canvasData, null, 2));
    // Look for board_id in canvas metadata
    if (canvasData.board_id) {
      const boardId = canvasData.board_id;
      // console.log('🔍 Found board_id in canvas_v2_metadata:', boardId);
      return getFriendlyBoardName(boardId);
    }
    // Look for board object in canvas metadata
    if (canvasData.board && typeof canvasData.board === 'object') {
      const boardObj = canvasData.board;
      if (boardObj.board_id) {
        // console.log('🔍 Found board.board_id in canvas_v2_metadata:', boardObj.board_id);
        return getFriendlyBoardName(boardObj.board_id);
      }
    }
  }

  // Check inside workflow for board information (if it exists)
  if (metadata.workflow && typeof metadata.workflow === 'object') {
    const workflow = metadata.workflow as any;

    // Check if workflow is a string (JSON)
    if (typeof workflow === 'string') {
      try {
        const workflowObj = JSON.parse(workflow);
        const boardInfo = extractBoardFromWorkflow(workflowObj);
        if (boardInfo) {
          return boardInfo;
        }
      } catch (e) {
        // Failed to parse workflow JSON
      }
    } else {
      // Workflow is already an object
      const boardInfo = extractBoardFromWorkflow(workflow);
      if (boardInfo) {
        return boardInfo;
      }
    }
  }

  // Try to find any field that might contain board info
  for (const [key, value] of Object.entries(metadata)) {
    if (key.toLowerCase().includes('board') && typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  // Default to "Uncategorized" if no board info found
  return 'Uncategorized';
}

// Helper function to extract board info from workflow
function extractBoardFromWorkflow(workflow: any): string | null {
  if (!workflow || !workflow.nodes) return null;

  // Look for canvas_output or l2i nodes that typically contain board info
  for (const node of workflow.nodes) {
    if (node.data && node.data.type && (node.data.type === 'l2i' || node.data.type === 'canvas_output')) {
      if (node.data.inputs && node.data.inputs.board) {
        const boardInput = node.data.inputs.board;

        // Check if board has a value with board_id
        if (boardInput.value && boardInput.value.board_id) {
          const boardId = boardInput.value.board_id;

          // Use the friendly board name mapping
          return getFriendlyBoardName(boardId);
        }
      }
    }
  }

  return null;
}

// Function to extract prompt text from metadata
function extractPrompt(metadata: ImageMetadata): string {
  // First check if normalized metadata is available (faster path)
  if ('normalizedMetadata' in metadata && metadata.normalizedMetadata) {
    const normalized = metadata.normalizedMetadata;
    if (normalized.prompt) {
      // Debug logging removed for performance
      return normalized.prompt;
    }
  }

  // NOVO: Se tem parameters (ComfyUI com A1111 embarcado), parse com A1111
  if (metadata.parameters && typeof metadata.parameters === 'string') {
    const a1111Data = parseA1111Metadata(metadata.parameters);
    if (a1111Data.prompt) return a1111Data.prompt;
  }

  // Fallback to format-specific extraction
  // Handle InvokeAI metadata
  if (isInvokeAIMetadata(metadata)) {
    // Try positive_prompt first (newer InvokeAI format)
    if (metadata.positive_prompt) {
      let prompt = metadata.positive_prompt;
      if (metadata.negative_prompt) {
        prompt += ' ### ' + metadata.negative_prompt;
      }
      return prompt;
    }

    // Fallback to legacy prompt field
    if (typeof metadata.prompt === 'string') {
      return metadata.prompt;
    } else if (Array.isArray(metadata.prompt)) {
      return metadata.prompt
        .map(p => typeof p === 'string' ? p : (p as any)?.prompt || '')
        .filter(p => p.trim())
        .join(' ');
    } else if (typeof metadata.prompt === 'object' && (metadata.prompt as any).prompt) {
      return (metadata.prompt as any).prompt;
    }
  }

  // Handle Automatic1111 metadata
  if (isAutomatic1111Metadata(metadata)) {
    // Extract prompt from the parameters string (everything before "Negative prompt:")
    const params = metadata.parameters;
    const negativePromptIndex = params.indexOf('\nNegative prompt:');
    if (negativePromptIndex !== -1) {
      return params.substring(0, negativePromptIndex).trim();
    }
    // If no negative prompt, take everything before the first parameter line
    const firstParamIndex = params.search(/\n[A-Z][a-z]+:/);
    if (firstParamIndex !== -1) {
      return params.substring(0, firstParamIndex).trim();
    }
    return params.trim();
  }

  // Handle ComfyUI metadata
  if (isComfyUIMetadata(metadata)) {
    try {
      // Parse prompt if it's a string
      let prompt: any = metadata.prompt;
      if (typeof prompt === 'string') {
        prompt = JSON.parse(prompt);
      }

      if (prompt) {
        // Look for CLIPTextEncode or similar text input nodes
        for (const [nodeId, nodeData] of Object.entries(prompt)) {
          const node = nodeData as any;
          if (node.class_type && node.class_type.toLowerCase().includes('text') &&
              node.class_type.toLowerCase().includes('encode')) {
            if (node.inputs && node.inputs.text && typeof node.inputs.text === 'string') {
              return node.inputs.text.trim();
            }
          }
        }

        // Fallback: look for any node with text input
        for (const [nodeId, nodeData] of Object.entries(prompt)) {
          const node = nodeData as any;
          if (node.inputs && node.inputs.text && typeof node.inputs.text === 'string') {
            return node.inputs.text.trim();
          }
        }
      }
    } catch (error) {
      console.warn('Failed to extract prompt from ComfyUI metadata:', error);
    }
  }

  // SPECIAL CASE: If we have normalizedMetadata but couldn't detect format,
  // it might be a cached ComfyUI image. Try to extract from normalizedMetadata directly
  if (metadata && typeof metadata === 'object' && 'normalizedMetadata' in metadata && (metadata as any).normalizedMetadata) {
    const normalized = (metadata as any).normalizedMetadata;
    // Debug logging removed for performance
    if (normalized.prompt && typeof normalized.prompt === 'string') {
      return normalized.prompt;
    }
  }

  return '';
}

// Function to extract negative prompt text from metadata
function extractNegativePrompt(metadata: ImageMetadata): string | undefined {
  // First check if normalized metadata is available (faster path)
  if ('normalizedMetadata' in metadata && metadata.normalizedMetadata) {
    const normalized = metadata.normalizedMetadata;
    if (normalized.negativePrompt) {
      // Debug logging removed for performance
      return normalized.negativePrompt;
    }
  }

  // For ComfyUI, the negative prompt is extracted during parseComfyUIMetadata
  // For other formats, negative prompts are typically embedded in the main prompt

  // SPECIAL CASE: If we have normalizedMetadata but couldn't detect format,
  // it might be a cached ComfyUI image. Try to extract from normalizedMetadata directly
  if (metadata && typeof metadata === 'object' && 'normalizedMetadata' in metadata && (metadata as any).normalizedMetadata) {
    const normalized = (metadata as any).normalizedMetadata;
    // Debug logging removed for performance
    if (normalized.negativePrompt && typeof normalized.negativePrompt === 'string') {
      return normalized.negativePrompt;
    }
  }

  return undefined;
}

// Board mapping cache to track unique board IDs and names
const boardIdCache = new Map<string, string>();
let boardCounter = 1;

// Function to get or create a friendly board name
function getFriendlyBoardName(boardId: string): string {
  if (boardIdCache.has(boardId)) {
    return boardIdCache.get(boardId)!;
  }

  // Create a new friendly name for this board ID
  const friendlyName = `My Board ${boardCounter}`;
  boardIdCache.set(boardId, friendlyName);
  boardCounter++;

  return friendlyName;
}

// Parse PNG metadata from tEXt chunks
async function parsePNGMetadata(buffer: ArrayBuffer, file: File): Promise<ImageMetadata | null> {
  const view = new DataView(buffer);
  let offset = 8;
  const decoder = new TextDecoder();

  // Collect all relevant chunks first
  const chunks: { [key: string]: string } = {};

  while (offset < buffer.byteLength) {
    const length = view.getUint32(offset);
    const type = decoder.decode(buffer.slice(offset + 4, offset + 8));

    if (type === 'tEXt') {
      const chunkData = buffer.slice(offset + 8, offset + 8 + length);
      const chunkString = decoder.decode(chunkData);
      const [keyword, text] = chunkString.split('\0');

      // Debug logging removed for performance

      // Collect relevant metadata chunks
      if (['invokeai_metadata', 'parameters', 'workflow', 'prompt'].includes(keyword) && text) {
        chunks[keyword] = text;
        // Debug logging removed for performance
      }
    }

    if (type === 'IEND') {
      break; // End of file
    }

    offset += 12 + length; // 4 for length, 4 for type, length for data, 4 for CRC
  }

  // Determine format based on priority:
  // 1. workflow → ComfyUI (highest priority)
  // 2. invokeai_metadata → InvokeAI
  // 3. parameters → Automatic1111
  // 4. prompt only → ComfyUI

  // Debug logging removed for performance

  if (chunks.workflow) {
    // Debug logging removed for performance
    // ComfyUI format (highest priority)
    let workflowData: any;
    let promptData: any = null;

    try {
      workflowData = JSON.parse(chunks.workflow);
    } catch {
      workflowData = chunks.workflow; // Keep as string if not valid JSON
    }

    if (chunks.prompt) {
      try {
        promptData = JSON.parse(chunks.prompt);
      } catch {
        promptData = chunks.prompt; // Keep as string if not valid JSON
      }
    }

    const comfyMetadata: ComfyUIMetadata = {
      workflow: workflowData,
      prompt: promptData
    };

    // Add normalized metadata for enhanced filtering
    try {
      // Debug logging removed for performance
      const normalized = parseComfyUIMetadata(comfyMetadata);
      // Debug logging removed for performance
      comfyMetadata.normalizedMetadata = normalized;
    } catch (error) {
      console.warn('Failed to parse normalized metadata for ComfyUI:', error);
    }

    return comfyMetadata;

  } else if (chunks.invokeai_metadata) {
    // Debug logging removed for performance
    // InvokeAI format
    const metadata = JSON.parse(chunks.invokeai_metadata) as InvokeAIMetadata;

    // Add normalized metadata for enhanced filtering
    try {
      // Debug logging removed for performance
      const normalized = parseInvokeAIMetadata(metadata);
      // Debug logging removed for performance
      metadata.normalizedMetadata = normalized;
    } catch (error) {
      console.warn('Failed to parse normalized metadata for InvokeAI:', error);
    }

    return metadata;

  } else if (chunks.parameters) {
    // Debug logging removed for performance
    // Automatic1111 format
    const a1111Metadata = {
      parameters: chunks.parameters
    } as Automatic1111Metadata;

    // Add normalized metadata for enhanced filtering
    try {
      a1111Metadata.normalizedMetadata = parseA1111Metadata(chunks.parameters);
    } catch (error) {
      console.warn('Failed to parse normalized metadata for Automatic1111:', error);
    }

    return a1111Metadata;

  } else if (chunks.prompt) {
    // Debug logging removed for performance
    // ComfyUI prompt-only format
    let promptData: any;
    try {
      promptData = JSON.parse(chunks.prompt);
    } catch {
      promptData = chunks.prompt; // Keep as string if not valid JSON
    }

    const comfyMetadata: ComfyUIMetadata = {
      prompt: promptData
    };

    // Add normalized metadata for enhanced filtering
    try {
      comfyMetadata.normalizedMetadata = parseComfyUIMetadata(comfyMetadata);
    } catch (error) {
      console.warn('Failed to parse normalized metadata for ComfyUI:', error);
    }

    return comfyMetadata;
  }

  return null;
}

// Parse JPEG metadata from EXIF data
async function parseJPEGMetadata(buffer: ArrayBuffer, file: File): Promise<ImageMetadata | null> {
  // Debug logging removed for performance

  try {
    // Use exifr to extract EXIF data
    const exifData = await parse(buffer, {
      // Extract specific EXIF fields that might contain metadata
      pick: ['UserComment', 'ImageDescription', 'Description', 'XPComment', 'XPTitle']
    });

    // Debug logging removed for performance

    let metadataText = null;
    let sourceField = null;

    // Priority order for metadata fields
    const fieldsToCheck = ['userComment', 'imageDescription', 'description', 'xpComment', 'xpTitle'];

    for (const field of fieldsToCheck) {
      if (exifData && exifData[field] && typeof exifData[field] === 'string' && exifData[field].trim()) {
        metadataText = exifData[field].trim();
        sourceField = field;
        // Debug logging removed for performance
        break;
      }
    }

    if (metadataText) {
      // Try to parse as JSON first (for structured metadata like InvokeAI)
      try {
        const parsedMetadata = JSON.parse(metadataText) as InvokeAIMetadata;
        // Debug logging removed for performance

        // Check if it's InvokeAI and normalize it
        if (isInvokeAIMetadata(parsedMetadata)) {
            try {
                parsedMetadata.normalizedMetadata = parseInvokeAIMetadata(parsedMetadata);
            } catch (error) {
                console.warn('Failed to parse normalized metadata for InvokeAI JPEG:', error);
            }
        }

        return parsedMetadata;
      } catch (jsonError) {
        // Debug logging removed for performance

        // If not JSON, try to parse as Automatic1111 format
        try {
          const normalized = parseA1111Metadata(metadataText);
          // Debug logging removed for performance
          return {
            parameters: metadataText,
            normalizedMetadata: normalized
          } as Automatic1111Metadata;
        } catch (a1111Error) {
          // Debug logging removed for performance
          return null;
        }
      }
    } else {
      // Debug logging removed for performance
      return null;
    }
  } catch (error) {
    console.error(`❌ Failed to parse JPEG EXIF metadata for ${file.name}:`, error);
    return null;
  }
}

async function parseImageMetadata(file: File): Promise<ImageMetadata | null> {
  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    const fileName = file.name.toLowerCase();

    // Check if it's a PNG file
    if (view.getUint32(0) === 0x89504E47 && view.getUint32(4) === 0x0D0A1A0A) {
      // Debug logging removed for performance
      return parsePNGMetadata(buffer, file);
    }

    // Check if it's a JPEG file
    if (view.getUint16(0) === 0xFFD8) {
      // Debug logging removed for performance
      return parseJPEGMetadata(buffer, file);
    }

    // Debug logging removed for performance
    return null; // Not a supported image format
  } catch (error) {
    console.error(`Failed to parse metadata for ${file.name}:`, error);
    return null;
  }
}

export async function getFileHandlesRecursive(
  directoryHandle: FileSystemDirectoryHandle,
  path: string = ''
): Promise<{handle: FileSystemFileHandle, path: string}[]> {
  const entries = [];
  const dirHandle = directoryHandle as any;

  // IMPROVED: Add Electron detection and handling like in App.tsx
  const isElectron = typeof window !== 'undefined' && (window as any).electronAPI;

  // Debug logging removed for performance

  if (isElectron) {
    try {
      const electronPath = localStorage.getItem('invokeai-electron-directory-path');

      if (!electronPath) {
        console.error('❌ No Electron directory path stored in localStorage');
        return entries;
      }

      const result = await (window as any).electronAPI.listDirectoryFiles(electronPath);

      // Validate result object exists and has expected structure
      if (!result) {
        console.error('❌ listDirectoryFiles returned undefined/null');
        return entries;
      }

      if (!result.success) {
        console.error('❌ Electron API failed:', result.error || 'Unknown error');
        return entries;
      }

      if (result.success && result.files) {
        // Debug logging removed for performance

        for (const fileInfo of result.files) {
          // Create a mock file handle for Electron
          const mockHandle = {
            name: fileInfo.name,
            kind: 'file' as const,
            getFile: async () => {
              try {
                // FIX: Cross-platform path joining - use forward slash for both Windows and macOS
                const fullPath = electronPath + '/' + fileInfo.name;

                const fileResult = await (window as any).electronAPI.readFile(fullPath);
                if (fileResult.success) {
                  // Create a proper File object from the buffer with lastModified date
                  const uint8Array = new Uint8Array(fileResult.data);
                  return new File([uint8Array], fileInfo.name, {
                    type: 'image/png',
                    lastModified: fileInfo.lastModified
                  });
                } else {
                  // Only log errors that aren't "file not found" to avoid spam when cache is stale
                  if (!fileResult.error?.includes('ENOENT') && !fileResult.error?.includes('no such file')) {
                    console.error('❌ Failed to read file:', fileInfo.name, fileResult.error);
                  }
                  // Return empty file as fallback with lastModified
                  return new File([], fileInfo.name, {
                    type: 'image/png',
                    lastModified: fileInfo.lastModified
                  });
                }
              } catch (error) {
                // Only log errors that aren't "file not found" to avoid spam when cache is stale
                if (!error?.message?.includes('ENOENT') && !error?.message?.includes('no such file')) {
                  console.error('❌ Error reading file in Electron:', fileInfo.name, error);
                }
                return new File([], fileInfo.name, {
                  type: 'image/png',
                  lastModified: fileInfo.lastModified
                });
              }
            }
          };
          entries.push({ handle: mockHandle, path: fileInfo.name });
        }
      } else {
        console.error('❌ Electron API failed:', result.error);
      }

      return entries;
    } catch (error) {
      console.error('❌ Error listing files in Electron:', error);
      return entries;
    }
  } else {
    // Use browser File System Access API
    // Debug logging removed for performance
    try {
      for await (const entry of dirHandle.values()) {
        const newPath = path ? `${path}/${entry.name}` : entry.name;
        if (entry.kind === 'file') {
          entries.push({handle: entry, path: newPath});
        } else if (entry.kind === 'directory') {
          // Fix: Explicitly cast entry to FileSystemDirectoryHandle as TypeScript fails to narrow the type.
          entries.push(...(await getFileHandlesRecursive(entry as FileSystemDirectoryHandle, newPath)));
        }
      }
    } catch (error) {
      console.error('❌ Error in browser File System Access API:', error);
      throw error;
    }
    return entries;
  }
}

// Function to filter out InvokeAI intermediate images
export function isIntermediateImage(filename: string): boolean {
  // DISABLED - showing all images for now
  return false;

  const name = filename.toLowerCase();

  // ONLY specific intermediate patterns - not normal InvokeAI images
  const intermediatePatterns = [
    // Classic intermediate patterns
    /^intermediate_/,
    /_intermediate_/,
    /^canvas_/,
    /_canvas_/,
    /^controlnet_/,
    /_controlnet_/,
    /^inpaint_/,
    /_inpaint_/,
    /^tmp_/,
    /_tmp_/,
    /^temp_/,
    /_temp_/,
    /\.tmp\.png$/,
    /\.temp\.png$/,

    // Only very specific intermediate patterns
    /^step_\d+_/, // step_001_something.png (not just step_)
    /^preview_step/, // preview_step images
    /^progress_/, // progress images
    /^mask_temp/, // temporary masks only
    /^noise_sample/, // noise samples
    /^guidance_preview/, // guidance previews
  ];

  return intermediatePatterns.some(pattern => pattern.test(name));
}

export async function processDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  setProgress: (progress: { current: number; total: number }) => void,
  specificFiles?: { handle: FileSystemFileHandle; path: string }[],
  directoryName?: string
): Promise<IndexedImage[]> {
  // Debug logging removed for performance

  try {
    // Debug logging removed for performance
    const allFileEntries = specificFiles || await getFileHandlesRecursive(directoryHandle);

    const imageFiles = allFileEntries.filter(entry => {
      const name = entry.handle.name.toLowerCase();
      const isImageFile = name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg');
      const isIntermediate = isIntermediateImage(entry.handle.name);

      if (isImageFile && !isIntermediate) {
        return true;
      } else if (isImageFile && isIntermediate) {
        return false;
      } else {
        return false;
      }
    });

    // Try to find thumbnails directory
    let thumbnailsDir: FileSystemDirectoryHandle | null = null;
    let thumbnailMap = new Map<string, FileSystemFileHandle>();

    // Check if we're in Electron environment
    const isElectron = typeof window !== 'undefined' && window.electronAPI;

    if (isElectron) {
      // In Electron, use the API to list thumbnail files
      try {
        const electronPath = localStorage.getItem('invokeai-electron-directory-path');
        if (electronPath) {
          const thumbnailsPath = electronPath + '/thumbnails';
          // Debug logging removed for performance

          const result = await window.electronAPI.listDirectoryFiles(thumbnailsPath);
          if (result.success && result.files) {
            // Debug logging removed for performance

            for (const fileInfo of result.files) {
              if (fileInfo.name.toLowerCase().endsWith('.webp')) {
                // Create mock thumbnail handle
                const mockThumbnailHandle = {
                  name: fileInfo.name,
                  kind: 'file' as const,
                  getFile: async () => {
                    try {
                      const fullPath = thumbnailsPath + '/' + fileInfo.name;
                      const fileResult = await window.electronAPI.readFile(fullPath);
                      if (fileResult.success && fileResult.data) {
                        // Convert Buffer to Uint8Array then to Blob
                        const uint8Array = new Uint8Array(fileResult.data);
                        const blob = new Blob([uint8Array], { type: 'image/webp' });
                        return blob;
                      } else {
                        throw new Error(fileResult.error || 'Failed to read thumbnail file');
                      }
                    } catch (error) {
                      console.error('Failed to read thumbnail file:', error);
                      throw error;
                    }
                  }
                };

                // Map thumbnail name to PNG name (remove .webp, add .png)
                const pngName = fileInfo.name.replace(/\.webp$/i, '.png');
                thumbnailMap.set(pngName, mockThumbnailHandle as any);
              }
            }
          } else {
            // Debug logging removed for performance
          }
        }
      } catch (error) {
        // Debug logging removed for performance
      }
    } else {
      // Browser environment - use File System Access API
      try {
        // Debug logging removed for performance
        thumbnailsDir = await directoryHandle.getDirectoryHandle('thumbnails');
        // Debug logging removed for performance
      } catch (error) {
        // Debug logging removed for performance
      }

      // Get thumbnail files if directory exists
      if (thumbnailsDir) {
        const thumbnailEntries = await getFileHandlesRecursive(thumbnailsDir);
        const webpFiles = thumbnailEntries.filter(entry => entry.handle.name.toLowerCase().endsWith('.webp'));

        for (const thumbEntry of webpFiles) {
          // Map thumbnail name to PNG name (remove .webp, add .png)
          const pngName = thumbEntry.handle.name.replace(/\.webp$/i, '.png');
          thumbnailMap.set(pngName, thumbEntry.handle);
        }
      }
    }

  const total = imageFiles.length;
  setProgress({ current: 0, total });

  const indexedImages: IndexedImage[] = [];
  let processedCount = 0;

  for (const fileEntry of imageFiles) {
    try {
      const file = await fileEntry.handle.getFile();
      const metadata = await parseImageMetadata(file);
      if (metadata) {
        // Create metadataString safely, handling non-serializable data
        let metadataString: string;
        try {
          metadataString = JSON.stringify(metadata);
        } catch (error) {
          console.warn(`⚠️ Failed to stringify metadata for ${fileEntry.handle.name}, using fallback:`, error);
          // Fallback: create a minimal serializable version
          metadataString = JSON.stringify({
            ...metadata,
            // Remove any potentially non-serializable properties
            normalizedMetadata: undefined,
            workflow: typeof metadata.workflow === 'string' ? metadata.workflow : undefined,
            prompt: typeof metadata.prompt === 'string' ? metadata.prompt : undefined
          });
        }
        const models = extractModels(metadata);
        const loras = extractLoras(metadata);
        const scheduler = extractScheduler(metadata);
        const board = extractBoard(metadata);

        // Find corresponding thumbnail
        const thumbnailHandle = thumbnailMap.get(fileEntry.handle.name);

        indexedImages.push({
          id: fileEntry.path,
          name: fileEntry.handle.name,
          handle: fileEntry.handle,
          thumbnailHandle,
          metadata,
          metadataString,
          lastModified: file.lastModified,
          models,
          loras,
          scheduler,
          board,
          prompt: extractPrompt(metadata),
          negativePrompt: extractNegativePrompt(metadata),
          cfgScale: extractCfgScale(metadata),
          steps: extractSteps(metadata),
          seed: extractSeed(metadata),
          dimensions: extractDimensions(metadata),
          directoryName,
        });

      }
    } catch (error) {
        console.error(`Skipping file ${fileEntry.handle.name} due to an error:`, error);
    }

    processedCount++;
    if (processedCount % 20 === 0 || processedCount === total) { // Update progress in batches
      setProgress({ current: processedCount, total });
    }
  }

  // Remove any duplicates by filename to prevent React key conflicts
  const seenNames = new Set<string>();
  const uniqueImages = indexedImages.filter(image => {
    if (seenNames.has(image.name)) {
      console.warn(`⚠️ Duplicate image found and removed: ${image.name}`);
      return false;
    }
    seenNames.add(image.name);
    return true;
  });

  // Debug logging removed for performance

  return uniqueImages;
  } catch (error) {
    console.error('❌ Error in processDirectory:', error);
    throw error;
  }
}

// Function to parse ComfyUI workflow and extract normalized metadata
function parseComfyUIMetadata(metadata: ComfyUIMetadata): BaseMetadata {
  const result: BaseMetadata = {
    prompt: '',
    model: '',
    width: 0,
    height: 0,
    steps: 0,
    scheduler: '',
    // Additional normalized fields
    models: [],
    loras: [],
    board: '',
    negativePrompt: '',
    cfgScale: 0,
    seed: undefined,
  };

  try {
    let workflow: any = metadata.workflow;
    let prompt: any = metadata.prompt;

    // Debug logging removed for performance

    // Parse workflow if it's a string
    if (typeof workflow === 'string') {
      try {
        workflow = JSON.parse(workflow);
        // Debug logging removed for performance
      } catch (error) {
        console.warn('❌ Failed to parse ComfyUI workflow string:', error);
        return result;
      }
    }

    // Parse prompt if it's a string
    if (typeof prompt === 'string') {
      try {
        prompt = JSON.parse(prompt);
        // Debug logging removed for performance
      } catch (error) {
        console.warn('❌ Failed to parse ComfyUI prompt string:', error);
        return result;
      }
    }

    // Determine which data source to use (prefer prompt over workflow, as it has the executed values)
    const dataSource = prompt || workflow;
    if (!dataSource) {
      console.warn('❌ No valid workflow or prompt data found in ComfyUI metadata');
      return result;
    }

    // Debug logging removed for performance

    // DEBUG: Log first few nodes to understand structure
    // Debug logging removed for performance

    // Log all node types found for debugging
    const nodeTypes = new Set<string>();
    const allNodes = [];
    for (const [nodeId, nodeData] of Object.entries(dataSource)) {
      const node = nodeData as any;
      const classType = node.class_type || node.type || '';
      if (classType) nodeTypes.add(classType);
      allNodes.push({ id: nodeId, type: classType, inputs: Object.keys(node.inputs || {}) });
    }
    // Debug logging removed for performance

    // Extract data from nodes - handle both workflow format (with class_type) and prompt format
    for (const [nodeId, nodeData] of Object.entries(dataSource)) {
      const node = nodeData as any;

      if (!node || typeof node !== 'object') continue;

      const classType = node.class_type || node.type || '';
      const inputs = node.inputs || {};

      // Debug logging removed for performance

      // Check if this node matches sampler criteria
      const isSamplerNode = classType.toLowerCase().includes('sampler') ||
          classType === 'KSampler' ||
          classType === 'SamplerCustom' ||
          classType === 'Sampler' ||
          classType === 'SamplerEuler' ||
          classType === 'SamplerEulerAncestral' ||
          classType === 'SamplerDPMPP2M' ||
          classType === 'SamplerDPMPP2MKarras' ||
          classType === 'SamplerDPMAdaptive' ||
          classType === 'SamplerLMS' ||
          classType === 'SamplerHeun' ||
          classType === 'SamplerDPM2' ||
          classType === 'SamplerDPM2Ancestral' ||
          classType === 'SamplerUniPC' ||
          classType === 'SamplerTCD' ||
          classType === 'SamplerLCM' ||
          classType.toLowerCase().includes('ksampler') ||
          classType.toLowerCase().includes('sample');

      if (isSamplerNode) {
        // Debug logging removed for performance
      }

      // Extract model from various checkpoint loader nodes
      if (classType.toLowerCase().includes('checkpoint') ||
          classType.toLowerCase().includes('model') ||
          classType === 'CheckpointLoaderSimple' ||
          classType === 'CheckpointLoader') {
        // Try different possible input names for checkpoint
        const ckptName = inputs.ckpt_name || inputs.checkpoint || inputs.model_name;
        if (ckptName && typeof ckptName === 'string') {
          result.models.push(ckptName);
          // Debug logging removed for performance
        }
      }

      // Extract LoRAs from various LoRA loader nodes
      if (classType.toLowerCase().includes('lora') ||
          classType === 'LoraLoader' ||
          classType === 'LoraLoaderModelOnly' ||
          classType === 'LoraLoaderModel') {
        const loraName = inputs.lora_name || inputs.lora || inputs.name;
        if (loraName && typeof loraName === 'string') {
          result.loras.push(loraName);
          // Debug logging removed for performance
        }
      }

      // Extract prompts from CLIP text encode nodes
      if (classType.toLowerCase().includes('clip') &&
          classType.toLowerCase().includes('text') &&
          (classType.toLowerCase().includes('encode') || classType === 'CLIPTextEncode' || classType === 'CLIPTextEncodeSDXL')) {
        const text = inputs.text || inputs.prompt || inputs.string;
        if (text && typeof text === 'string') {
          // Simple heuristic: check if text contains negative keywords
          const isNegative = text.toLowerCase().includes('blur') ||
                           text.toLowerCase().includes('deform') ||
                           text.toLowerCase().includes('ugly') ||
                           text.toLowerCase().includes('worst') ||
                           text.toLowerCase().includes('low quality') ||
                           text.toLowerCase().includes('bad') ||
                           text.toLowerCase().includes('negative');
          if (isNegative && !result.negativePrompt) {
            result.negativePrompt = text;
            // Debug logging removed for performance
          } else if (!isNegative && !result.prompt) {
            result.prompt = text;
            // Debug logging removed for performance
          }
        }
      }

      // Extract sampler parameters from various sampler nodes
      if (classType.toLowerCase().includes('sampler') ||
          classType === 'KSampler' ||
          classType === 'SamplerCustom' ||
          classType === 'Sampler' ||
          classType === 'SamplerEuler' ||
          classType === 'SamplerEulerAncestral' ||
          classType === 'SamplerDPMPP2M' ||
          classType === 'SamplerDPMPP2MKarras' ||
          classType === 'SamplerDPMAdaptive' ||
          classType === 'SamplerLMS' ||
          classType === 'SamplerHeun' ||
          classType === 'SamplerDPM2' ||
          classType === 'SamplerDPM2Ancestral' ||
          classType === 'SamplerUniPC' ||
          classType === 'SamplerTCD' ||
          classType === 'SamplerLCM' ||
          classType.toLowerCase().includes('ksampler') ||
          classType.toLowerCase().includes('sample')) {
        // Debug logging removed for performance
        // Try different input names
        const steps = inputs.steps || inputs.step_count || inputs.num_steps || inputs.steps_count;
        const cfg = inputs.cfg || inputs.cfg_scale || inputs.guidance_scale || inputs.scale || inputs.guidance || inputs.cfg_value;
        const seed = inputs.seed || inputs.noise_seed || inputs.seed_value;
        const samplerName = inputs.sampler_name || inputs.sampler || inputs.sampling_method || inputs.method;

        // Debug logging removed for performance

        // Check if inputs are strings that need parsing
        if (typeof steps === 'string') {
          const parsedSteps = parseInt(steps, 10);
          if (!isNaN(parsedSteps) && parsedSteps > 0) {
            result.steps = parsedSteps;
            // Debug logging removed for performance
          }
        } else if (typeof steps === 'number' && steps > 0) {
          result.steps = steps;
          // Debug logging removed for performance
        } else {
          // Debug logging removed for performance
        }

        if (typeof cfg === 'string') {
          const parsedCfg = parseFloat(cfg);
          if (!isNaN(parsedCfg) && parsedCfg > 0) {
            result.cfgScale = parsedCfg;
            // Debug logging removed for performance
          }
        } else if (typeof cfg === 'number' && cfg > 0) {
          result.cfgScale = cfg;
          // Debug logging removed for performance
        } else {
          // Debug logging removed for performance
        }

        if (seed !== undefined && seed !== null) {
          let seedValue: number;
          if (Array.isArray(seed)) {
            // Handle seed references like ["46", 0] - these point to other nodes
            // Debug logging removed for performance
            // For now, skip array references - we'll look for actual seed values elsewhere
          } else if (typeof seed === 'string') {
            seedValue = parseInt(seed, 10);
            if (!isNaN(seedValue) && seedValue >= 0) {
              result.seed = seedValue;
              // Debug logging removed for performance
            }
          } else if (typeof seed === 'number') {
            if (seed >= 0) {
              result.seed = seed;
              // Debug logging removed for performance
            }
          } else {
            // Debug logging removed for performance
          }
        } else {
          // Debug logging removed for performance
        }
        if (samplerName && typeof samplerName === 'string') {
          result.scheduler = samplerName;
          // Debug logging removed for performance
        } else if (inputs.scheduler && typeof inputs.scheduler === 'string') {
          result.scheduler = inputs.scheduler;
          // Debug logging removed for performance
        } else {
          // Debug logging removed for performance
        }
      }

      // Look for seed values in any node (including Seed Everywhere nodes)
      if (classType.toLowerCase().includes('seed') || classType === 'Seed Everywhere' || classType === 'Random Seed') {
        // Debug logging removed for performance

        // Look for seed values in inputs
        for (const [key, value] of Object.entries(inputs)) {
          if (key.toLowerCase().includes('seed') && typeof value === 'number' && value > 0 && !result.seed) {
            result.seed = value;
            // Debug logging removed for performance
            break;
          }
        }
      }
      if (classType.toLowerCase().includes('latent') ||
          classType === 'EmptyLatentImage' ||
          classType === 'LatentFromPrompt' ||
          classType === 'EmptyImage' ||
          classType === 'ImageSize' ||
          classType === 'LatentUpscale' ||
          classType === 'LatentDownscale' ||
          classType.toLowerCase().includes('image') ||
          classType.toLowerCase().includes('size') ||
          classType.toLowerCase().includes('dimension')) {
        const width = inputs.width || inputs.image_width || inputs.size_width || inputs.w || inputs.x;
        const height = inputs.height || inputs.image_height || inputs.size_height || inputs.h || inputs.y;

        // Debug logging removed for performance

        if (typeof width === 'number' && width > 0) {
          result.width = width;
          // Debug logging removed for performance
        }
        if (typeof height === 'number' && height > 0) {
          result.height = height;
          // Debug logging removed for performance
        }
      }
    }

    // Fallback: if no prompts found, look for any text inputs
    if (!result.prompt && !result.negativePrompt) {
      // Debug logging removed for performance
      for (const [nodeId, nodeData] of Object.entries(dataSource)) {
        const node = nodeData as any;
        const inputs = node.inputs || {};
        if (inputs.text && typeof inputs.text === 'string') {
          const text = inputs.text.toLowerCase();
          // Simple heuristic for negative prompts
          if (text.includes('blur') || text.includes('deform') || text.includes('ugly') ||
              text.includes('worst') || text.includes('low quality') || text.includes('bad')) {
            if (!result.negativePrompt) {
              result.negativePrompt = inputs.text;
              // Debug logging removed for performance
            }
          } else {
            if (!result.prompt) {
              result.prompt = inputs.text;
              // Debug logging removed for performance
            }
          }
        }
      }
    }

    // Additional fallback: look for numeric parameters in any node that might contain generation settings
    if ((result.steps === 0 || result.cfgScale === 0) && !result.seed) {
      // Debug logging removed for performance
      for (const [nodeId, nodeData] of Object.entries(dataSource)) {
        const node = nodeData as any;
        const inputs = node.inputs || {};
        const classType = node.class_type || node.type || '';

        // Look for common parameter names in any node
        const possibleSteps = inputs.steps || inputs.step_count || inputs.num_steps || inputs.steps_count || inputs.step || inputs.n_steps;
        const possibleCfg = inputs.cfg || inputs.cfg_scale || inputs.guidance_scale || inputs.scale || inputs.guidance || inputs.cfg_value || inputs.strength;
        const possibleSeed = inputs.seed || inputs.noise_seed || inputs.seed_value || inputs.random_seed;

        // Debug logging removed for performance

        if (typeof possibleSteps === 'string') {
          const parsed = parseInt(possibleSteps, 10);
          if (!isNaN(parsed) && parsed > 0 && parsed < 200 && result.steps === 0) {
            result.steps = parsed;
            // Debug logging removed for performance
          }
        } else if (typeof possibleSteps === 'number' && possibleSteps > 0 && possibleSteps < 200 && result.steps === 0) {
          result.steps = possibleSteps;
          // Debug logging removed for performance
        }

        if (typeof possibleCfg === 'string') {
          const parsed = parseFloat(possibleCfg);
          if (!isNaN(parsed) && parsed > 0 && parsed < 50 && result.cfgScale === 0) {
            result.cfgScale = parsed;
            // Debug logging removed for performance
          }
        } else if (typeof possibleCfg === 'number' && possibleCfg > 0 && possibleCfg < 50 && result.cfgScale === 0) {
          result.cfgScale = possibleCfg;
          // Debug logging removed for performance
        }

        if (possibleSeed !== undefined && possibleSeed !== null && result.seed === undefined) {
          let seedValue: number;
          if (typeof possibleSeed === 'string') {
            seedValue = parseInt(possibleSeed, 10);
          } else {
            seedValue = possibleSeed;
          }
          if (!isNaN(seedValue) && seedValue >= 0) {
            result.seed = seedValue;
            // Debug logging removed for performance
          }
        }
      }
    }

    // Final comprehensive search: look for any node with generation parameters
    // Debug logging removed for performance
    for (const [nodeId, nodeData] of Object.entries(dataSource)) {
      const node = nodeData as any;
      const inputs = node.inputs || {};
      const classType = node.class_type || node.type || '';

      // Look for any input that could be steps, cfg, or seed
      for (const [inputKey, inputValue] of Object.entries(inputs)) {
        const key = inputKey.toLowerCase();
        const value = inputValue;

        // Debug logging removed for performance

        // Check for steps
        if ((key.includes('step') || key === 'steps' || key === 'n_steps') && result.steps === 0) {
          if (typeof value === 'number' && value > 0 && value < 200) {
            result.steps = value;
            // Debug logging removed for performance
          } else if (typeof value === 'string') {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed) && parsed > 0 && parsed < 200) {
              result.steps = parsed;
              // Debug logging removed for performance
            }
          }
        }

        // Check for CFG
        if ((key.includes('cfg') || key.includes('guidance') || key === 'scale' || key === 'strength') && result.cfgScale === 0) {
          if (typeof value === 'number' && value > 0 && value < 50) {
            result.cfgScale = value;
            // Debug logging removed for performance
          } else if (typeof value === 'string') {
            const parsed = parseFloat(value);
            if (!isNaN(parsed) && parsed > 0 && parsed < 50) {
              result.cfgScale = parsed;
              // Debug logging removed for performance
            }
          }
        }

        // Check for seed
        if ((key.includes('seed') || key === 'noise_seed') && result.seed === undefined) {
          if (typeof value === 'number' && value >= 0) {
            result.seed = value;
            // Debug logging removed for performance
          } else if (typeof value === 'string') {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed) && parsed >= 0) {
              result.seed = parsed;
              // Debug logging removed for performance
            }
          }
        }
      }
    }

    // Set primary model if found
    if (result.models.length > 0) {
      result.model = result.models[0];
    }

    // Debug logging removed for performance

  } catch (error) {
    console.error('❌ Failed to parse ComfyUI metadata:', error);
  }

  return result;
}

// Helper function to determine if a text node is for positive or negative prompt
function determinePromptType(nodeId: string, workflowOrPrompt: any, classType: string): boolean {
  try {
    // In API format, the full workflow is passed; in prompt format, just the prompt object is.
    const isApiFormat = Array.isArray(workflowOrPrompt.nodes) && Array.isArray(workflowOrPrompt.links);

    if (isApiFormat) {
      // API/Workflow format: Use the 'links' array to find connections
      const links = workflowOrPrompt.links;
      for (const link of links) {
        // link format: [link_id, source_node_id, source_slot, target_node_id, target_slot, type]
        const sourceNodeId = String(link[1]);

        if (sourceNodeId === nodeId) {
          const targetNodeId = link[3];
          const targetSlotIndex = link[4];
          const targetNode = workflowOrPrompt.nodes.find((n: any) => n.id === targetNodeId);

          if (targetNode && targetNode.inputs && targetNode.inputs[targetSlotIndex]) {
            const inputName = targetNode.inputs[targetSlotIndex].name;
            if (inputName.toLowerCase().includes('positive')) return true;
            if (inputName.toLowerCase().includes('negative')) return false;
          }
        }
      }
    } else {
      // Prompt format: Iterate through nodes and check their inputs
      for (const otherNode of Object.values(workflowOrPrompt)) {
        const node = otherNode as any;
        if (!node.inputs) continue;

        for (const [inputName, inputValue] of Object.entries(node.inputs)) {
          if (Array.isArray(inputValue) && String(inputValue[0]) === nodeId) {
            // Found connection. Check the input name.
            if (inputName.toLowerCase().includes('positive')) return true;
            if (inputName.toLowerCase().includes('negative')) return false;
          }
        }
      }
    }

    // Fallback: check the node's own class type for hints if connection logic fails
    if (classType.toLowerCase().includes('positive')) return true;
    if (classType.toLowerCase().includes('negative')) return false;

  } catch (error) {
    console.warn('Failed to determine prompt type:', error);
  }

  // Default to positive if no definitive connection found
  return true;
}

// Function to parse Automatic1111 parameters string and extract normalized metadata
function parseA1111Metadata(parameters: string): BaseMetadata {
  const result: BaseMetadata = {
    prompt: '',
    model: '',
    width: 0,
    height: 0,
    steps: 0,
    scheduler: '',
    // Additional normalized fields
    negativePrompt: '',
    cfgScale: 0,
    seed: undefined,
  };

  try {
    // Extract prompt (everything before "Negative prompt:")
    const negativePromptIndex = parameters.indexOf('\nNegative prompt:');
    if (negativePromptIndex !== -1) {
      result.prompt = parameters.substring(0, negativePromptIndex).trim();
    } else {
      // If no negative prompt, take everything before the first parameter line
      const firstParamIndex = parameters.search(/\n[A-Z][a-z]+:/);
      if (firstParamIndex !== -1) {
        result.prompt = parameters.substring(0, firstParamIndex).trim();
      } else {
        result.prompt = parameters.trim();
      }
    }

    // Extract negative prompt
    if (negativePromptIndex !== -1) {
      const negativePromptEndIndex = parameters.indexOf('\n', negativePromptIndex + 1);
      if (negativePromptEndIndex !== -1) {
        result.negativePrompt = parameters.substring(negativePromptIndex + 17, negativePromptEndIndex).trim();
      } else {
        result.negativePrompt = parameters.substring(negativePromptIndex + 17).trim();
      }
    }

    // Extract model
    const modelMatch = parameters.match(/Model:\s*([^,\n]+)/i);
    if (modelMatch) {
      result.model = modelMatch[1].trim();
    }

    // Extract steps
    const stepsMatch = parameters.match(/Steps:\s*(\d+)/i);
    if (stepsMatch) {
      const steps = parseInt(stepsMatch[1], 10);
      if (!isNaN(steps)) {
        result.steps = steps;
      }
    }

    // Extract sampler/scheduler
    const samplerMatch = parameters.match(/Sampler:\s*([^,\n]+)/i);
    if (samplerMatch) {
      result.scheduler = samplerMatch[1].trim();
    }

    // Extract CFG scale
    const cfgMatch = parameters.match(/CFG scale:\s*([0-9.]+)/i);
    if (cfgMatch) {
      const cfgScale = parseFloat(cfgMatch[1]);
      if (!isNaN(cfgScale)) {
        result.cfgScale = cfgScale;
      }
    }

    // Extract seed
    const seedMatch = parameters.match(/Seed:\s*([0-9]+)/i);
    if (seedMatch) {
      const seed = parseInt(seedMatch[1], 10);
      if (!isNaN(seed)) {
        result.seed = seed;
      }
    }

    // Extract size (width x height)
    const sizeMatch = parameters.match(/Size:\s*(\d+)\s*x\s*(\d+)/i);
    if (sizeMatch) {
      const width = parseInt(sizeMatch[1], 10);
      const height = parseInt(sizeMatch[2], 10);
      if (!isNaN(width) && !isNaN(height)) {
        result.width = width;
        result.height = height;
      }
    }

  } catch (error) {
    console.warn('Failed to parse Automatic1111 parameters:', error);
  }

  return result;
}

// Function to extract CFG scale from metadata
function extractCfgScale(metadata: ImageMetadata): number | undefined {
  // First check if normalized metadata is available (faster path)
  if ('normalizedMetadata' in metadata && metadata.normalizedMetadata) {
    const normalized = metadata.normalizedMetadata;
    if (normalized.cfgScale !== undefined && typeof normalized.cfgScale === 'number') {
      // Debug logging removed for performance
      return normalized.cfgScale;
    }
  }

  // NOVO: Se tem parameters (ComfyUI com A1111 embarcado), parse com A1111
  if (metadata.parameters && typeof metadata.parameters === 'string') {
    const a1111Data = parseA1111Metadata(metadata.parameters);
    if (a1111Data.cfgScale) return a1111Data.cfgScale;
  }

  // Fallback to format-specific extraction
  // Handle InvokeAI metadata
  if (isInvokeAIMetadata(metadata)) {
    return metadata.cfg_scale;
  }

  // Handle Automatic1111 metadata
  if (isAutomatic1111Metadata(metadata)) {
    // Extract CFG scale from parameters string using regex
    const params = metadata.parameters;
    const cfgMatch = params.match(/CFG scale:\s*([0-9.]+)/i);
    if (cfgMatch) {
      const cfgScale = parseFloat(cfgMatch[1]);
      return isNaN(cfgScale) ? undefined : cfgScale;
    }
  }

  // Handle ComfyUI metadata
  if (isComfyUIMetadata(metadata)) {
    try {
      let workflow: any = metadata.workflow;
      if (typeof workflow === 'string') {
        workflow = JSON.parse(workflow);
      }

      if (workflow) {
        // Look for KSampler nodes which contain CFG scale
        for (const [nodeId, nodeData] of Object.entries(workflow)) {
          const node = nodeData as any;
          if (node.class_type === 'KSampler' && node.inputs && node.inputs.cfg) {
            const cfg = parseFloat(node.inputs.cfg);
            if (!isNaN(cfg)) {
              return cfg;
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to extract CFG scale from ComfyUI metadata:', error);
    }
  }

  // SPECIAL CASE: If we have normalizedMetadata but couldn't detect format,
  // it might be a cached ComfyUI image. Try to extract from normalizedMetadata directly
  if (metadata && typeof metadata === 'object' && 'normalizedMetadata' in metadata && (metadata as any).normalizedMetadata) {
    const normalized = (metadata as any).normalizedMetadata;
    // Debug logging removed for performance
    if (normalized.cfgScale !== undefined && typeof normalized.cfgScale === 'number') {
      return normalized.cfgScale;
    }
  }

  return undefined;
}

// Function to extract steps from metadata
function extractSteps(metadata: ImageMetadata): number | undefined {
  // First check if normalized metadata is available (faster path)
  if ('normalizedMetadata' in metadata && metadata.normalizedMetadata) {
    const normalized = metadata.normalizedMetadata;
    if (normalized.steps !== undefined && typeof normalized.steps === 'number') {
      // Debug logging removed for performance
      return normalized.steps;
    }
  }

  // SPECIAL CASE: If we have normalizedMetadata but couldn't detect format,
  // it might be a cached ComfyUI image. Try to extract from normalizedMetadata directly
  if (metadata && typeof metadata === 'object' && 'normalizedMetadata' in metadata && (metadata as any).normalizedMetadata) {
    const normalized = (metadata as any).normalizedMetadata;
    // Debug logging removed for performance
    if (normalized.steps !== undefined && typeof normalized.steps === 'number') {
      return normalized.steps;
    }
  }

  // NOVO: Se tem parameters (ComfyUI com A1111 embarcado), parse com A1111
  if (metadata.parameters && typeof metadata.parameters === 'string') {
    const a1111Data = parseA1111Metadata(metadata.parameters);
    if (a1111Data.steps) return a1111Data.steps;
  }

  // Fallback to format-specific extraction
  // Handle InvokeAI metadata
  if (isInvokeAIMetadata(metadata)) {
    return metadata.steps;
  }

  // Handle Automatic1111 metadata
  if (isAutomatic1111Metadata(metadata)) {
    // Extract steps from parameters string using regex
    const params = metadata.parameters;
    const stepsMatch = params.match(/Steps:\s*([0-9]+)/i);
    if (stepsMatch) {
      const steps = parseInt(stepsMatch[1], 10);
      return isNaN(steps) ? undefined : steps;
    }
  }

  // Handle ComfyUI metadata
  if (isComfyUIMetadata(metadata)) {
    try {
      let workflow: any = metadata.workflow;
      if (typeof workflow === 'string') {
        workflow = JSON.parse(workflow);
      }

      if (workflow) {
        // Look for KSampler nodes which contain steps
        for (const [nodeId, nodeData] of Object.entries(workflow)) {
          const node = nodeData as any;
          if (node.class_type === 'KSampler' && node.inputs && node.inputs.steps) {
            const steps = parseInt(node.inputs.steps, 10);
            if (!isNaN(steps)) {
              return steps;
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to extract steps from ComfyUI metadata:', error);
    }
  }

  return undefined;
}

// Function to extract seed from metadata
function extractSeed(metadata: ImageMetadata): number | undefined {
  // First check if normalized metadata is available (faster path)
  if ('normalizedMetadata' in metadata && metadata.normalizedMetadata) {
    const normalized = metadata.normalizedMetadata;
    if (normalized.seed !== undefined && typeof normalized.seed === 'number') {
      // Debug logging removed for performance
      return normalized.seed;
    }
  }

  // NOVO: Se tem parameters (ComfyUI com A1111 embarcado), parse com A1111
  if (metadata.parameters && typeof metadata.parameters === 'string') {
    const a1111Data = parseA1111Metadata(metadata.parameters);
    if (a1111Data.seed) return a1111Data.seed;
  }

  // Fallback to format-specific extraction
  // Handle InvokeAI metadata
  if (isInvokeAIMetadata(metadata)) {
    return metadata.seed;
  }

  // Handle Automatic1111 metadata
  if (isAutomatic1111Metadata(metadata)) {
    // Extract seed from parameters string using regex
    const params = metadata.parameters;
    const seedMatch = params.match(/Seed:\s*([0-9]+)/i);
    if (seedMatch) {
      const seed = parseInt(seedMatch[1], 10);
      return isNaN(seed) ? undefined : seed;
    }
  }

  // Handle ComfyUI metadata
  if (isComfyUIMetadata(metadata)) {
    try {
      let workflow: any = metadata.workflow;
      if (typeof workflow === 'string') {
        workflow = JSON.parse(workflow);
      }

      if (workflow) {
        // Look for KSampler nodes which contain seed
        for (const [nodeId, nodeData] of Object.entries(workflow)) {
          const node = nodeData as any;
          if (node.class_type === 'KSampler' && node.inputs && node.inputs.seed) {
            const seed = parseInt(node.inputs.seed, 10);
            if (!isNaN(seed)) {
              return seed;
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to extract seed from ComfyUI metadata:', error);
    }
  }

  // SPECIAL CASE: If we have normalizedMetadata but couldn't detect format,
  // it might be a cached ComfyUI image. Try to extract from normalizedMetadata directly
  if (metadata && typeof metadata === 'object' && 'normalizedMetadata' in metadata && (metadata as any).normalizedMetadata) {
    const normalized = (metadata as any).normalizedMetadata;
    // Debug logging removed for performance
    if (normalized.seed !== undefined && typeof normalized.seed === 'number') {
      return normalized.seed;
    }
  }

  return undefined;
}

// Function to extract dimensions from metadata
function extractDimensions(metadata: ImageMetadata): string | undefined {
  // First check if normalized metadata is available (faster path)
  if ('normalizedMetadata' in metadata && metadata.normalizedMetadata) {
    const normalized = metadata.normalizedMetadata;
    if (normalized.width && normalized.height) {
      // Debug logging removed for performance
      return `${normalized.width}x${normalized.height}`;
    }
  }

  // NOVO: Se tem parameters (ComfyUI com A1111 embarcado), parse com A1111
  if (metadata.parameters && typeof metadata.parameters === 'string') {
    const a1111Data = parseA1111Metadata(metadata.parameters);
    if (a1111Data.width && a1111Data.height) {
      return `${a1111Data.width}x${a1111Data.height}`;
    }
  }

  // Fallback to format-specific extraction
  // Handle InvokeAI metadata
  if (isInvokeAIMetadata(metadata)) {
    if (metadata.width && metadata.height) {
      return `${metadata.width}x${metadata.height}`;
    }
  }

  // Handle Automatic1111 metadata
  if (isAutomatic1111Metadata(metadata)) {
    // Extract dimensions from parameters string using regex
    const params = metadata.parameters;
    const sizeMatch = params.match(/Size:\s*([0-9]+x[0-9]+)/i);
    if (sizeMatch) {
      return sizeMatch[1];
    }
  }

  // Handle ComfyUI metadata
  if (isComfyUIMetadata(metadata)) {
    try {
      let workflow: any = metadata.workflow;
      if (typeof workflow === 'string') {
        workflow = JSON.parse(workflow);
      }

      if (workflow) {
        // Look for EmptyLatentImage nodes which contain dimensions
        for (const [nodeId, nodeData] of Object.entries(workflow)) {
          const node = nodeData as any;
          if (node.class_type === 'EmptyLatentImage' && node.inputs) {
            const width = node.inputs.width;
            const height = node.inputs.height;
            if (width && height) {
              return `${width}x${height}`;
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to extract dimensions from ComfyUI metadata:', error);
    }
  }

  return undefined;
}

// Function to parse InvokeAI parameters and extract normalized metadata
function parseInvokeAIMetadata(metadata: InvokeAIMetadata): BaseMetadata {
  const result: BaseMetadata = {
    format: 'InvokeAI',
    prompt: '',
    model: '',
    width: 0,
    height: 0,
    steps: 0,
    scheduler: '',
    // Additional normalized fields
    negativePrompt: '',
    cfgScale: 0,
    seed: undefined,
    models: [],
    loras: [],
  };

  try {
    // Extract positive prompt
    if (typeof metadata.positive_prompt === 'string') {
      result.prompt = metadata.positive_prompt;
    } else if (typeof metadata.prompt === 'string') {
      result.prompt = metadata.prompt;
    } else if (Array.isArray(metadata.prompt)) {
      result.prompt = metadata.prompt
        .map(p => (typeof p === 'string' ? p : p.prompt || ''))
        .filter(p => p.trim())
        .join(' ');
    }

    // Extract negative prompt
    if (typeof metadata.negative_prompt === 'string') {
      result.negativePrompt = metadata.negative_prompt;
    }

    // Extract core metadata
    if (metadata.model_name) result.model = metadata.model_name;
    if (metadata.width) result.width = metadata.width;
    if (metadata.height) result.height = metadata.height;
    if (metadata.steps) result.steps = metadata.steps;
    if (metadata.scheduler) result.scheduler = metadata.scheduler;
    if (metadata.cfg_scale) result.cfgScale = metadata.cfg_scale;
    if (metadata.seed) result.seed = metadata.seed;

    // Extract models and LoRAs
    result.models = extractModelsFromInvokeAI(metadata);
    result.loras = extractLorasFromInvokeAI(metadata);

    if(result.models.length > 0) {
      result.model = result.models[0];
    }

  } catch (error) {
    console.warn('Failed to parse InvokeAI parameters:', error);
  }

  return result;
}

// Export utility functions for use in other modules
export { extractPrompt, extractModels, extractLoras, extractScheduler, extractBoard, extractCfgScale, extractSteps, extractSeed, extractDimensions, extractNegativePrompt, parseImageMetadata, parseComfyUIMetadata, parseA1111Metadata, parseInvokeAIMetadata };