/**
 * title: 基础用法
 * description: 防抖输入框
 */
import React, { useState } from 'react';
import { Input, Space, Typography, Spin, List, Flex } from 'antd';
import { useDebouncedState } from '@tx-labs/react-hooks';

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

export default function DemoUseDebouncedStateBasic() {
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [text, setText, { pending, debouncedState: debouncedText }] = useDebouncedState<string>(
    '',
    {
      delay: 500,
    },
  );

  // 模拟搜索 API
  const mockSearch = (query: string) => {
    return demoOptions.filter((item) => item.toLowerCase().includes(query.toLowerCase()));
  };

  // 每次 debouncedText 变动时发起模拟请求
  React.useEffect(() => {
    if (debouncedText) {
      const results = mockSearch(debouncedText);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  }, [debouncedText]);

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Space style={{ width: '100%' }} size={12}>
        <Typography.Text>可供搜索的选项池：</Typography.Text>
        {demoOptions.map((option) => (
          <Typography.Text key={option}>{option}</Typography.Text>
        ))}
      </Space>
      <Input
        placeholder="请输入搜索内容..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        allowClear
      />

      <Flex>
        <Typography.Text>防抖值（input 框中是实时值）：</Typography.Text>
        <Typography.Text>{debouncedText || '-'}</Typography.Text>
      </Flex>
      <Typography.Text>{pending ? '正在输入...' : '搜索结果'}</Typography.Text>
      <Spin spinning={pending}>
        <List
          bordered
          dataSource={searchResults}
          renderItem={(item) => <List.Item key={item}>{item}</List.Item>}
        />
      </Spin>
    </Space>
  );
}
