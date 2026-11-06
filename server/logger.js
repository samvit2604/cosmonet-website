export function createLogger(output = process.stdout) {
  // Accept only operational identifiers/codes. Never log request bodies, headers,
  // provider bodies, email addresses, client IPs, or raw exception messages.
  return (event, fields = {}) => {
    const safe = {};
    for (const key of ['requestId', 'jobId', 'leadId', 'code', 'kind', 'attempts', 'count', 'durationMs']) {
      const value = fields[key];
      if (typeof value === 'number' || typeof value === 'boolean' || (typeof value === 'string' && /^[a-zA-Z0-9_./:-]{1,150}$/.test(value))) safe[key] = value;
    }
    output.write(JSON.stringify({ time: new Date().toISOString(), event, ...safe }) + '\n');
  };
}
