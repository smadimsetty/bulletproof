import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { supabase } from './lib/supabase';

export default function App() {
  const [status, setStatus] = useState('loading...');

  useEffect(() => {
    supabase
      .from('exercises')
      .select('*', { count: 'exact', head: true })
      .then(({ count, error }) => {
        setStatus(error ? `error: ${error.message}` : `exercises count: ${count}`);
      });
  }, []);

  return (
    <View style={styles.container}>
      <Text>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
