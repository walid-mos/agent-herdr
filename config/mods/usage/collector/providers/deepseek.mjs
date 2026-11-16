export default {
  id: "deepseek",
  name: "DeepSeek",
  key: "DEEPSEEK_API_KEY",
  url: "https://api.deepseek.com/user/balance",
  read: (body) => {
    const [info] = body.balance_infos ?? [];
    return { amount: Number(info?.total_balance), currency: info?.currency };
  },
};
