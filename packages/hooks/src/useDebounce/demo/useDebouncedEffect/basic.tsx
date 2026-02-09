/**
 * title: 基础用法
 */
import React, { useMemo, useState } from 'react';
import { Input, List, Space, Spin, Typography } from 'antd';
import { useBoolean, useDebouncedEffect } from '@tx-labs/react-hooks';

interface Item {
  id: number;
  name: string;
}

const demoOptions = [
  'React',
  'Redux',
  'RxJS',
  'Next.js',
  'Vue',
  'Vite',
  'TypeScript',
  'Ant Design',
  'Dumi',
  'Umi',
];

function mockSearch(keyword: string): Promise<Item[]> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      const list = demoOptions
        .filter((x) => x.toLowerCase().includes(keyword.toLowerCase()))
        .map((name, idx) => ({ id: idx + 1, name }));
      resolve(list);
    }, 500);
  });
}

export default function DemoUseDebouncedEffectBasic() {
  const [keyword, setKeyword] = useState('');
  const [loading, loadingActions] = useBoolean(false);
  const [data, setData] = useState<Item[]>([]);
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);

  const title = useMemo(() => {
    return keyword ? `搜索结果：${keyword}` : '请输入关键词';
  }, [keyword]);

  useDebouncedEffect(
    () => {
      const k = keyword.trim();
      setLastRunAt(Date.now());

      if (!k) {
        setData([]);
        loadingActions.setFalse();
        return;
      }

      let cancelled = false;
      loadingActions.setTrue();

      mockSearch(k)
        .then((list) => {
          if (cancelled) return;
          setData(list);
        })
        .finally(() => {
          if (cancelled) return;
          loadingActions.setFalse();
        });

      // cleanup：如果在“请求已发出后、返回前”依赖又变了，就忽略这次结果
      return () => {
        cancelled = true;
      };
    },
    [keyword],
    { delay: 400 },
  );

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Space style={{ width: '100%' }} size={12}>
        <Typography.Text>可供搜索的选项池：</Typography.Text>
        {demoOptions.map((option) => (
          <Typography.Text key={option}>{option}</Typography.Text>
        ))}
      </Space>
      <Input
        placeholder="输入后停止 400ms 才会触发请求"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        allowClear
      />

      <Space size={12}>
        <Typography.Text type="secondary">最近一次触发时间：</Typography.Text>
        <Typography.Text>
          {lastRunAt ? new Date(lastRunAt).toLocaleTimeString() : '-'}
        </Typography.Text>
      </Space>

      <Spin spinning={loading}>
        <List
          header={<Typography.Text strong>{title}</Typography.Text>}
          bordered
          dataSource={data}
          locale={{ emptyText: keyword ? '暂无匹配结果' : '等待输入...' }}
          renderItem={(item) => <List.Item key={item.name}>{item.name}</List.Item>}
        />
      </Spin>
    </Space>
  );
}
