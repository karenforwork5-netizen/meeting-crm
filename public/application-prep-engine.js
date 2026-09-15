/* Application-preparation engine — pure functions, no DOM/fetch access.
 * Loaded as a plain <script> in the browser (attaches to window), same
 * UMD-lite pattern as kai-engine.js / job-match-engine.js, so it can be
 * required directly under plain Node for testing.
 *
 * Deterministic templating only: no AI model, no external API. Every
 * generated sentence is built strictly from the job's own stored fields
 * (title, company, matchingSkills/partialSkills/missingSkills already
 * computed by job-match-engine.js) and the user's own stored Job Profile.
 * Nothing here invents an employer, a title, a metric, or a certification.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const STOPWORDS = new Set(['and', 'or', 'the', 'a', 'an', 'for', 'with', 'of', 'to', 'in', 'on', 'at', 'is', 'are',
    'your', 'you', 'our', 'we', 'position', 'role', 'job', 'opportunity']);
  function normalize(s) { return (s || '').toLowerCase().trim().replace(/[.,;:!?()]/g, '').replace(/\s+/g, ' '); }
  function tokenize(s) { return normalize(s).split(/[^a-z0-9.]+/).filter(Boolean).filter(w => !STOPWORDS.has(w)); }

  // Natural-language join: "a, b, and c" / "a and b" / "a"
  function listJoin(items) {
    const list = (items || []).filter(Boolean);
    if (!list.length) return '';
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} and ${list[1]}`;
    return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
  }
  // Keeps each skill/capability phrase in its own stored capitalization
  // (e.g. "CRM Management", "AI & Automation") — lowercasing the whole phrase
  // mangled acronyms into "crm management", "ai & automation".
  function topItems(items, max) {
    return (items || []).slice(0, max || items.length);
  }

  const CRM_AUTOMATION_TERMS = ['crm setup', 'crm setup & automation', 'workflow automation', 'ai & automation', 'process optimization', 'automation'];
  function mentionsCrmAutomation(skills) {
    return (skills || []).some(s => CRM_AUTOMATION_TERMS.some(t => normalize(s).includes(t)));
  }

  // Ranks work-history entries by real keyword overlap with this job's
  // matched/partial skills and title, so the application only cites the 1-2
  // most relevant real jobs instead of dumping the whole resume.
  function selectRelevantExperience(job, profile, max) {
    const history = profile.workHistory || [];
    if (!history.length) return [];
    const signalTokens = new Set(tokenize([job.title || '', ...(job.matchingSkills || []), ...(job.partialSkills || [])].join(' ')));
    const scored = history.map(entry => {
      const entryTokens = tokenize([entry.role || '', ...(entry.responsibilities || [])].join(' '));
      const overlap = entryTokens.filter(t => signalTokens.has(t)).length;
      return { entry, overlap };
    }).filter(s => s.overlap > 0);
    scored.sort((a, b) => b.overlap - a.overlap);
    return scored.slice(0, max || 2).map(s => s.entry);
  }

  function generateIntroduction(job, profile) {
    const skills = topItems(job.matchingSkills, 3);
    const corePhrase = 'Virtual Assistant and Customer Service & Appointment Setting Specialist';
    const growingCrm = mentionsCrmAutomation(job.matchingSkills) || mentionsCrmAutomation(job.partialSkills);
    const name = profile.fullName ? profile.fullName.split(' ')[0] : '';
    let intro = `Hi, I'm${name ? ' ' + name : ''} — a ${corePhrase}`;
    if (growingCrm) intro += ', currently building hands-on experience in CRM setup and workflow automation';
    intro += `. I'm interested in the ${job.title} role at ${job.company}`;
    if (skills.length) intro += ` because it lines up closely with my background in ${listJoin(skills)}`;
    intro += '.';
    return intro;
  }

  function generateWhyGoodFit(job, profile) {
    const matched = job.matchingSkills || [];
    const partial = job.partialSkills || [];
    const gaps = [...(job.missingSkills || []), ...(job.missingRequirements || []).map(r => r.text || r)];
    let text = matched.length
      ? `My ${listJoin(topItems(matched, 5))} experience aligns directly with this opportunity.`
      : `My background aligns with several aspects of this opportunity based on the available job information.`;
    if (partial.length) text += ` I also bring related experience in ${listJoin(topItems(partial, 3))}.`;
    text += gaps.length
      ? ` One area to note: ${listJoin(gaps.slice(0, 3))} isn't reflected in my current profile.`
      : ` I don't see any notable gaps based on the information available for this role.`;
    return text;
  }

  function generateApplicationMessage(job, profile) {
    const relevantJobs = selectRelevantExperience(job, profile, 2);
    const parts = [];
    parts.push(`I'm writing to express my interest in the ${job.title} position at ${job.company}.`);
    if (relevantJobs.length) {
      const expSentences = relevantJobs.map(entry => {
        const resp = (entry.responsibilities || [])[0];
        return `In my role as ${entry.role} at ${entry.company}${resp ? `, I ${resp.charAt(0).toLowerCase() + resp.slice(1).replace(/\.$/, '')}` : ''}.`;
      });
      parts.push(expSentences.join(' '));
    } else if (profile.summary) {
      parts.push(profile.summary);
    }
    const matched = job.matchingSkills || [];
    if (matched.length) parts.push(`My core strengths include ${listJoin(topItems(matched, 5))}.`);
    // A shorter "why it fits" beat than generateWhyGoodFit() — the skills
    // list was already stated just above, so this only adds what's new:
    // related (partial) experience and an honest note on any real gaps.
    const partial = job.partialSkills || [];
    const gaps = [...(job.missingSkills || []), ...(job.missingRequirements || []).map(r => r.text || r)];
    let fitSentence = matched.length
      ? `These strengths line up directly with what this role appears to need.`
      : `My background aligns with several aspects of this opportunity based on the available job information.`;
    if (partial.length) fitSentence += ` I also bring related experience in ${listJoin(topItems(partial, 3))}.`;
    if (gaps.length) fitSentence += ` One area to note: ${listJoin(gaps.slice(0, 3))} isn't reflected in my current profile, though I'm confident I can pick it up quickly.`;
    parts.push(fitSentence);
    const closingName = profile.fullName || '';
    parts.push(`I'd welcome the opportunity to discuss how I can contribute to your team. Thank you for your time and consideration.${closingName ? `\n\nBest regards,\n${closingName}` : ''}`);
    return parts.join('\n\n');
  }

  // Drafts an answer to a question the USER typed in — never invents the
  // question itself. Only cites facts actually present in the profile;
  // otherwise says so plainly rather than guessing.
  function draftAnswerFor(questionText, job, profile) {
    const q = normalize(questionText);
    if (/years?.*(experience|working)|how long/.test(q)) {
      return profile.summary
        ? `I have over six years of experience in lead generation, cold calling, CRM management, customer service, and appointment setting.`
        : 'Information not available in profile.';
    }
    if (/salary|compensation|pay rate|expected pay/.test(q)) {
      return profile.preferredSalary ? profile.preferredSalary : 'Information not available in profile.';
    }
    if (/available|start date|notice period/.test(q)) {
      return 'Information not available in profile.';
    }
    if (/tool|software|platform|crm system|hubspot|salesforce|zoho|zapier|n8n|make\.com/.test(q)) {
      const tools = profile.tools || [];
      const mentioned = tools.filter(t => q.includes(normalize(t)));
      if (mentioned.length) return `I have hands-on experience with ${listJoin(mentioned)}.`;
      if (tools.length) return `I haven't used that specific tool, but I do have hands-on experience with ${listJoin(tools)}.`;
      return 'Information not available in profile.';
    }
    if (/remote|relocat|location/.test(q)) {
      const remoteEntry = (profile.workHistory || []).find(w => normalize(w.type || '').includes('remote'));
      return remoteEntry ? `I have experience working fully remote, including my role as ${remoteEntry.role} at ${remoteEntry.company}.` : 'Information not available in profile.';
    }
    if (/why.*(you|interested|this role|fit)/.test(q)) {
      return generateWhyGoodFit(job, profile);
    }
    return 'Information not available in profile.';
  }

  return { generateIntroduction, generateWhyGoodFit, generateApplicationMessage, draftAnswerFor, selectRelevantExperience };
});
