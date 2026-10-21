const toolDirectivePattern = /^\s*(?:eslint-disable(?:-next-line|-line)?|eslint-enable|@ts-expect-error)\b/;

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow comments: names of variables, functions and classes must explain the code on their own.',
    },
    messages: {
      noComments: 'Comments are not allowed. Make the code self-explanatory with clear names instead.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type === 'Shebang' || toolDirectivePattern.test(comment.value)) {
            continue;
          }
          context.report({ loc: comment.loc, messageId: 'noComments' });
        }
      },
    };
  },
};
