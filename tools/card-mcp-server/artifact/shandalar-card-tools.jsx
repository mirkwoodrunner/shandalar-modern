import { useState, useCallback } from 'react';

const SCRYFALL_BASE = 'https://api.scryfall.com';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

async function scryfallFetch(path) {
  await new Promise(r => setTimeout(r, 75));
  const res = await fetch(`${SCRYFALL_BASE}${path}`);
  if (!res.ok) throw new Error(`Scryfall ${res.status}: ${path}`);
  return res.json();
}

async function callClaude(apiKey, systemPrompt, userMessage) {
  const tools = [
    {
      name: 'scryfall_fetch',
      description: 'Fetch data from the Scryfall API. Use this to look up card data or rulings.',
      input_schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Scryfall API path, e.g. /cards/named?exact=Serra+Angel or /cards/{id}/rulings',
          },
        },
        required: ['path'],
      },
    },
  ];

  const messages = [{ role: 'user', content: userMessage }];
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };

  let response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: MODEL, max_tokens: 2048, system: systemPrompt, tools, messages }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Anthropic API ${response.status}: ${err}`);
  }

  let data = await response.json();

  // Agentic tool-use loop
  while (data.stop_reason === 'tool_use') {
    const assistantMsg = { role: 'assistant', content: data.content };
    messages.push(assistantMsg);

    const toolResults = [];
    for (const block of data.content) {
      if (block.type !== 'tool_use') continue;
      let toolOutput;
      try {
        const result = await scryfallFetch(block.input.path);
        toolOutput = JSON.stringify(result, null, 2);
      } catch (e) {
        toolOutput = `Error: ${e.message}`;
      }
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: toolOutput });
    }

    messages.push({ role: 'user', content: toolResults });

    response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: MODEL, max_tokens: 2048, system: systemPrompt, tools, messages }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`Anthropic API ${response.status}: ${err}`);
    }
    data = await response.json();
  }

  const textBlock = data.content.find(b => b.type === 'text');
  return textBlock?.text ?? '(no text response)';
}

const SYSTEMS = {
  card_lookup: {
    label: 'Card Lookup',
    systemPrompt:
      'You are a Magic: The Gathering oracle text assistant. ' +
      'When given a card name, call scryfall_fetch with path /cards/named?exact=<URL-encoded name>. ' +
      'Format the response as:\n## <Name>\n**Cost:** <mana_cost> | **CMC:** <cmc> | **Type:** <type_line>\n' +
      '**P/T:** <power>/<toughness> (omit if not a creature)\n\n**Oracle Text:**\n<oracle_text>\n\n' +
      '**Keywords:** <keywords joined by comma>\n**Colors:** <colors joined by comma or "colorless">\n**Set:** <set>',
    fields: [{ key: 'card', label: 'Card name', placeholder: 'Serra Angel' }],
    buildMessage: ({ card }) => `Look up card: ${card}`,
  },
  rules_conflict: {
    label: 'Rules Conflict',
    systemPrompt:
      'You are a Magic: The Gathering rules assistant. ' +
      'Use scryfall_fetch to get the card at /cards/named?exact=<name>, then get its rulings at /cards/<id>/rulings. ' +
      'Return the oracle text, all official rulings (date + text), and then the proposed implementation verbatim. ' +
      'Do not judge — just present the data side by side so the developer can spot discrepancies.',
    fields: [
      { key: 'card', label: 'Card name', placeholder: 'Prodigal Sorcerer' },
      { key: 'impl', label: 'Proposed implementation', placeholder: 'Tap: deal 1 damage to target...', multiline: true },
    ],
    buildMessage: ({ card, impl }) =>
      `Card: ${card}\n\nProposed implementation:\n${impl}`,
  },
  missing_card_gen: {
    label: 'Missing Card Gen',
    systemPrompt:
      'You are a cards.js code generator for the Shandalar Modern project. ' +
      'Use scryfall_fetch at /cards/named?exact=<name> to get the card data. ' +
      'Return ONLY a JavaScript object literal with these fields: id (slug), name, cost (use {W} notation), ' +
      'cmc (number), type (first main type word), subtype (after the em-dash or empty string), ' +
      'color (first letter of first color or empty), power/toughness (strings or null), effect (as instructed or "STUB"), keywords (array). ' +
      'Output only the JS snippet, nothing else.',
    fields: [
      { key: 'card', label: 'Card name', placeholder: 'Sengir Vampire' },
      { key: 'effect', label: 'Effect hint (optional)', placeholder: 'STUB' },
    ],
    buildMessage: ({ card, effect }) =>
      `Generate a cards.js entry for: ${card}${effect ? `\nEffect: ${effect}` : ''}`,
  },
  stub_validator: {
    label: 'Stub Validator',
    systemPrompt:
      'You are a cards.js validator for the Shandalar Modern project. ' +
      'The user will paste a cards.js entry. Extract the card name, then use scryfall_fetch at ' +
      '/cards/named?exact=<name> to fetch canonical data. Compare these fields: name, cmc, type, cost. ' +
      'Return a markdown table with columns: Field | cards.js Value | Scryfall Value | Match. ' +
      'Add a summary line at the bottom.',
    fields: [
      { key: 'entry', label: 'Paste cards.js entry', placeholder: '{id:"serra_angel", name:"Serra Angel", ...}', multiline: true },
    ],
    buildMessage: ({ entry }) => `Validate this cards.js entry:\n${entry}`,
  },
  audit_crossref: {
    label: 'Audit Crossref',
    systemPrompt:
      'You are a Magic: The Gathering batch oracle lookup assistant. ' +
      'The user provides card names (one per line). For each card, call scryfall_fetch at ' +
      '/cards/named?exact=<URL-encoded name>. Return a markdown table with columns: ' +
      'Card | Type | Oracle Text (truncated to 80 chars). If a card is not found, mark it NOT FOUND.',
    fields: [
      { key: 'names', label: 'Card names (one per line)', placeholder: 'Circle of Protection: White\nForcefield', multiline: true },
    ],
    buildMessage: ({ names }) => `Look up these cards:\n${names}`,
  },
};

function ResultBlock({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <div className="mt-4 relative">
      <button
        onClick={copy}
        className="absolute top-2 right-2 text-xs bg-gray-700 text-gray-200 px-2 py-1 rounded hover:bg-gray-600"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre className="bg-gray-900 text-green-300 text-sm p-4 rounded overflow-auto whitespace-pre-wrap max-h-96">
        {text}
      </pre>
    </div>
  );
}

function ToolTab({ config, apiKey }) {
  const [values, setValues] = useState({});
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = useCallback(async () => {
    if (!apiKey.trim()) {
      setError('Enter your Anthropic API key above first.');
      return;
    }
    setLoading(true);
    setError('');
    setResult('');
    try {
      const msg = config.buildMessage(values);
      const text = await callClaude(apiKey, config.systemPrompt, msg);
      setResult(text);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiKey, config, values]);

  return (
    <div className="space-y-3">
      {config.fields.map(f => (
        <div key={f.key}>
          <label className="block text-sm font-medium text-gray-300 mb-1">{f.label}</label>
          {f.multiline ? (
            <textarea
              rows={4}
              placeholder={f.placeholder}
              value={values[f.key] ?? ''}
              onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded px-3 py-2 text-sm font-mono"
            />
          ) : (
            <input
              type="text"
              placeholder={f.placeholder}
              value={values[f.key] ?? ''}
              onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded px-3 py-2 text-sm"
            />
          )}
        </div>
      ))}
      <button
        onClick={submit}
        disabled={loading}
        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded"
      >
        {loading ? 'Running...' : 'Run'}
      </button>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {result && <ResultBlock text={result} />}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('card_lookup');
  const [apiKey, setApiKey] = useState('');

  const tabs = Object.entries(SYSTEMS);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold mb-1">Shandalar Card Tools</h1>
        <p className="text-gray-400 text-sm mb-4">
          Browser UI for the five Shandalar MCP server tools. Uses Scryfall live data via the Anthropic API.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-300 mb-1">Anthropic API Key</label>
          <input
            type="password"
            placeholder="sk-ant-..."
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded px-3 py-2 text-sm font-mono"
          />
        </div>

        <div className="flex gap-1 mb-4 flex-wrap">
          {tabs.map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`text-sm px-3 py-1.5 rounded ${
                activeTab === key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {cfg.label}
            </button>
          ))}
        </div>

        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <h2 className="text-sm font-semibold text-indigo-400 mb-3">{SYSTEMS[activeTab].label}</h2>
          <ToolTab
            key={activeTab}
            config={SYSTEMS[activeTab]}
            apiKey={apiKey}
          />
        </div>
      </div>
    </div>
  );
}
