const response = {
  dump: {
    schema: 'mock-schema',
    data: 'mock-data',
    trigger: 'mock-trigger'
  },
  tables: []
};

export default () =>
  new Promise((resolve) => {
    resolve(response);
  });
