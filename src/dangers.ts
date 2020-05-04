import { get } from 'https';
import * as Danger from 'danger';
import {
    Text,
    validateText,
    constructSettingsForText,
    getDefaultSettings,
    mergeSettings,
    getLanguagesForExt,
  } from 'cspell-lib'
  import { extname, resolve } from 'path'
  import { readFileSync } from 'fs'
const branchTypes = ['fix', 'feat', 'chore', 'docs', 'style', 'refactor', 'perf', 'test'];

const BRANCH_GUIDE = 'https://github.com/AckeeCZ/styleguide/blob/master/git/guides/branch-naming.md';
const MSG_GUIDE = 'https://github.com/AckeeCZ/styleguide/blob/master/git/guides/commit-message.md';
const COMMIT_GUIDE = 'https://github.com/AckeeCZ/styleguide/blob/master/git/guides/authoring-commits.md';

const EMAIL_REG = new RegExp('@(ack.ee|ackee.cz)$');

const capitalize = (str: string) => `${str.charAt(0).toUpperCase()}${str.substr(1)}`;
const codes = (str: string) =>
    Array.from(Array(str.length).keys())
        .map(i => `\\${str.charCodeAt(i)}`)
        .join('');

const getGitmoji = () =>
    new Promise<Array<Record<'emoji' | 'code', string>>>((resolve, reject) => {
        get('https://raw.githubusercontent.com/carloscuesta/gitmoji/master/src/data/gitmojis.json', res => {
            res.setEncoding('utf8');
            let body = '';
            res.on('data', data => {
                body += data;
            });
            res.on('error', reject);
            res.on('end', () => {
                resolve(JSON.parse(body).gitmojis);
            });
        });
    });

    const getTyposForText = async (text: string, filename: string) => {
        const config = constructSettingsForText(
          mergeSettings(getDefaultSettings(), {
            ignoreWords: [],
          }),
          text,
          getLanguagesForExt(extname(filename))
        )
        const offsets = await validateText(text, config)
        return Text.calculateTextDocumentOffsets(filename, text, offsets)
      }

enum OffenseType {
    BRANCH_FORMAT = 'BRANCH_FORMAT',
    BRANCH_TYPE = 'BRANCH_TYPE',
    BRANCH_NOT_DELETED = 'BRANCH_NOT_DELETED',
    COMMIT_MISSING_TRACKER_REFERENCE = 'COMMIT_MISSING_TRACKER_REFERENCE',
    COMMIT_BRANCH_TRACKER_REFERENCE_MISMATCH = 'COMMIT_BRANCH_TRACKER_REFERENCE_MISMATCH',
    COMMIT_MESSAGE_LENGTH = 'COMMIT_MESSAGE_LENGTH',
    COMMIT_MESSAGE_FORMAT = 'COMMIT_MESSAGE_FORMAT',
    COMMIT_MESSAGE_INVALID_GITMOJI = 'COMMIT_MESSAGE_INVALID_GITMOJI',
    COMMIT_MESSAGE_TYPO = 'COMMIT_MESSAGE_TYPO',
    COMMIT_INVALID_AUTHOR_EMAIL = 'COMMIT_INVALID_AUTHOR_EMAIL',
    COMMIT_FIXUP = 'COMMIT_FIXUP',
    CODE_TYPO = 'CODE_TYPO',
}
type Offense =
    | {
          type: OffenseType.BRANCH_FORMAT;
          branchName: string;
      }
    | {
          type: OffenseType.BRANCH_TYPE;
          branchType: string;
      }
    | {
          type: OffenseType.BRANCH_NOT_DELETED;
      }
    | {
          type: OffenseType.COMMIT_MISSING_TRACKER_REFERENCE;
          sha: string;
      }
    | {
          type: OffenseType.COMMIT_BRANCH_TRACKER_REFERENCE_MISMATCH;
          sha: string;
          expectedReference: string;
          found: string[];
      }
    | {
          type: OffenseType.COMMIT_MESSAGE_LENGTH;
          sha: string;
          length: number;
      }
    | {
          type: OffenseType.COMMIT_MESSAGE_FORMAT;
          sha: string;
          diff: string;
      }
    | {
          type: OffenseType.COMMIT_MESSAGE_INVALID_GITMOJI;
          sha: string;
          found: string;
      }
    | {
          type: OffenseType.COMMIT_MESSAGE_TYPO;
          typos: Text.TextDocumentOffset[];
      }
      | {
        type: OffenseType.CODE_TYPO;
        typos: Text.TextDocumentOffset[];
    }
    | {
          type: OffenseType.COMMIT_INVALID_AUTHOR_EMAIL;
          sha: string;
          found: string;
      }
    | {
          type: OffenseType.COMMIT_FIXUP;
          sha: string;
      };

const formatMessage = (m: Offense) => {
    switch (m.type) {
        case OffenseType.BRANCH_FORMAT:
            return `🌳 Branch name \`${m.branchName}\` does not follow the [format](${BRANCH_GUIDE}) \`{type}/{issue-id}-{feature-name}\`.`;
        case OffenseType.BRANCH_TYPE:
            return `🌳 Feature type\`${
                m.branchType
            }\` is not one of the [allowed types](${BRANCH_GUIDE}): ${branchTypes.map(t => `\`${t}\``).join(', ')}.`;
        case OffenseType.BRANCH_NOT_DELETED:
            return `🗑️ Merging this MR will not delete the source branch.`;
        case OffenseType.COMMIT_MISSING_TRACKER_REFERENCE:
            return `🎫 Commit ${m.sha} does not have an [issue reference](${MSG_GUIDE}) for any issue.`;
        case OffenseType.COMMIT_BRANCH_TRACKER_REFERENCE_MISMATCH:
            return `🎫 Commit ${m.sha} does not have an [issue reference](${MSG_GUIDE}) for the issue \`#${
                m.expectedReference
            }\` from source branch, found ${m.found.map(r => `\`#${r}\``).join(', ')}.`;
        case OffenseType.COMMIT_MESSAGE_LENGTH:
            return `💬 Commit ${m.sha} exceeds maximum length on first line ${m.length}/${50}.`;
        case OffenseType.COMMIT_MESSAGE_FORMAT:
            return `💬 Commit ${m.sha} has odd formatting. \n${m.diff}`;
        case OffenseType.COMMIT_MESSAGE_INVALID_GITMOJI:
            return `💬 Commit ${
                m.sha
            } does not seem to use [Gitmoji](${MSG_GUIDE}). Expected unicode emoji symbol, got \`${
                m.found
            }\` (\`${codes(m.found)}\`).`;
        case OffenseType.CODE_TYPO: {
            const [first, ...rest] = m.typos
            const occurrence = `🔤 \`${first.text}\` might be a typo.`
            const reps = `Same word is repeated ${rest.length} more times in ${rest.map(t => `${t.uri}${t.row}`).join(', ')}`
            return `${occurrence} ${rest.length > 0 ? reps : ''}`;
        }
        case OffenseType.COMMIT_MESSAGE_TYPO: {
            const [first, ...rest] = m.typos
            const occurrence = `🔤 \`${first.text}\` in ${first.uri}'s commit message might be a typo.`
            const reps = `Same word is repeated ${rest.length} more times in ${rest.map(t => t.uri).join(', ')}`
            return `${occurrence} ${rest.length > 0 ? reps : ''}`;
        }
        case OffenseType.COMMIT_INVALID_AUTHOR_EMAIL:
            return `✉️ Commit ${m.sha} has a fishy email \`${m.found}\`. Does not [match](${COMMIT_GUIDE}) \`${EMAIL_REG}\`.`;
        case OffenseType.COMMIT_FIXUP:
            return `🚧 Commit ${m.sha} is a fixup, skipping checks.`;
        default:
            return `MISSING MESSAGE FOR ${JSON.stringify(m)}!`;
    }
};

export const rules = async ({ danger, warn, markdown, schedule, message }: typeof Danger) => {
    const messages: Offense[] = [];
    const branchName = danger.gitlab.mr.source_branch;
    const [branchMatched, type, issueNumber, description] = branchName.match(/([a-z]+)\/([0-9]+)(.*)/) ?? [];
    if (!branchMatched) {
        messages.push({ branchName, type: OffenseType.BRANCH_FORMAT });
    }
    if (!branchTypes.includes(type)) {
        messages.push({ branchType: type, type: OffenseType.BRANCH_TYPE });
    }
    if (danger.gitlab.mr.should_remove_source_branch) {
        messages.push({ type: OffenseType.BRANCH_NOT_DELETED });
    }
    markdown(`🎫 #${issueNumber}`);

    const gitmojis = await getGitmoji();

    const checkReferences = (commit: Danger.GitCommit) => {
        const commitsReferences = (commit.message.match(/(?:#)[0-9]+/g) ?? []).map(x => x.substr(1));

        if (commitsReferences.length === 0) {
            return messages.push({ type: OffenseType.COMMIT_MISSING_TRACKER_REFERENCE, sha: commit.sha });
        }
        if (issueNumber && !commitsReferences.includes(issueNumber)) {
            messages.push({
                type: OffenseType.COMMIT_BRANCH_TRACKER_REFERENCE_MISMATCH,
                sha: commit.sha,
                expectedReference: issueNumber,
                found: commitsReferences,
            });
        }
    };

    const checkFormat = (commit: Danger.GitCommit) => {
        const commitHeader = commit.message.split('\n')[0];
        const [, symbol, title] = commitHeader.match(/^\s*(\S*)\s*(.*)$/) ?? [];
        const usedGitmoji = gitmojis.find(g => g.code === symbol || g.emoji === symbol);
        if (commitHeader.length > 50) {
            messages.push({ type: OffenseType.COMMIT_MESSAGE_LENGTH, sha: commit.sha, length: commitHeader.length });
        }
        if (usedGitmoji) {
            const expectedMessage = `${usedGitmoji.emoji} ${capitalize(title)}`;
            if (expectedMessage !== commitHeader) {
                const diff = `
\`\`\`diff
- ${commitHeader}
+ ${expectedMessage}${commit.message.substr(commitHeader.length).replace(/\n/g, '\n  ')}
\`\`\`
`;
                messages.push({ type: OffenseType.COMMIT_MESSAGE_FORMAT, sha: commit.sha, diff });
            }
        } else {
            messages.push({ type: OffenseType.COMMIT_MESSAGE_INVALID_GITMOJI, sha: commit.sha, found: symbol });
        }
    };
    const checkEmail = (commit: Danger.GitCommit) => {
        if (!commit.author.email.match(EMAIL_REG)) {
            messages.push({
                type: OffenseType.COMMIT_INVALID_AUTHOR_EMAIL,
                sha: commit.sha,
                found: commit.author.email,
            });
        }
    };

    danger.git.commits.forEach(commit => {
        if (commit.message.startsWith('fixup!')) {
            messages.push({ type: OffenseType.COMMIT_FIXUP, sha: commit.sha });
        }
        checkReferences(commit);
        checkFormat(commit);
        checkEmail(commit);
    });

    schedule(async () => {
        const commitTypos: Text.TextDocumentOffset[] = []
        for (const commit of danger.git.commits) {
          commitTypos.push(...await getTyposForText(commit.message, commit.sha))
        }
        if (commitTypos.length === 0) return;
        Object.values(
            commitTypos.reduce(
              (r, v) => ((r[v.text.toLowerCase()] || (r[v.text.toLowerCase()] = [])).push(v), r),
              {} as Record<string, Text.TextDocumentOffset[]>
            )
          ).forEach(typos => {
              message(formatMessage({ type: OffenseType.COMMIT_MESSAGE_TYPO, typos }))
          })
      })
      schedule(async () => {
        const allTypos: Text.TextDocumentOffset[] = []
        for (const filename of [
          ...danger.git.created_files,
          ...danger.git.modified_files,
        ]) {
          if (filename.match(/package-lock.json/)) {
            continue
          }
          const contents = readFileSync(resolve(__dirname, '..', filename), 'utf8')
          allTypos.push(...(await getTyposForText(contents, filename)))
        }
        Object.values(
          allTypos.reduce(
            (r, v) => ((r[v.text.toLowerCase()] || (r[v.text.toLowerCase()] = [])).push(v), r),
            {} as Record<string, Text.TextDocumentOffset[]>
          )
        ).forEach(typos => {
          warn(formatMessage({ type: OffenseType.CODE_TYPO, typos }), typos[0].uri, typos[0].row)
        })
      })


    Object.values(OffenseType).map(type => {
        const selected = messages.filter(m => m.type === type).map(formatMessage);
        if (selected.length > 1) selected.unshift('');
        const msg = selected.join('\n - ');
        if (msg) warn(msg);
    });
};
