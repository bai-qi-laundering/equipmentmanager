"""Exercise the NAS updater without a NAS, Git, network or real Docker."""
from pathlib import Path
import os, subprocess, tempfile, unittest
ROOT = Path(__file__).resolve().parents[1]
class UpdaterTest(unittest.TestCase):
 def run_case(self, fail=False, keys=True):
  temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
  home=Path(temp.name);project=home/'project';project.mkdir();binpath=home/'bin';binpath.mkdir()
  (project/'server').mkdir();(project/'server/server.js').write_text('old server')
  (project/'data').mkdir();(project/'data/do-not-touch').write_text('actual data')
  compose='services:\n  api:\n    environment:\n      DATABASE_URL: postgresql://original-secret\n'
  (project/'docker-compose.yml').write_text(compose)
  (project/'docker-compose.public.yml').write_text('original gateway config')
  (project/'.env').write_text('DATABASE_PASSWORD=original-secret\n')
  (project/'public-api.env').write_text('API_ACCESS_KEYS='+'a'*64+'\n')
  script=(ROOT/'update-system.sh').read_text()
  script=script.replace('PATH=/usr/local/bin:/usr/bin:/bin:/var/packages/ContainerManager/target/usr/bin:$PATH',f'PATH={binpath}:$PATH')
  (project/'run.sh').write_text(script)
  fake='''#!/usr/bin/env python3
import os,sys,pathlib,shutil,subprocess
args=sys.argv[1:]; tool=pathlib.Path(sys.argv[0]).name
log=pathlib.Path(os.environ['FAKE_LOG'])
def event(msg):
 with log.open('a')as f:f.write(msg+'\\n')
if tool=='curl':
 url=next(x for x in args if x.startswith('http'))
 if 'raw.githubusercontent.com' in url:
  path='/'.join(url.split('/')[6:]);event('download '+path)
  if os.environ['FAIL_DOWNLOAD']=='1' and path=='server/reminders.mjs':sys.exit(22)
  shutil.copyfile(pathlib.Path(os.environ['SOURCE_ROOT'])/path,args[args.index('-o')+1]);sys.exit(0)
 pathlib.Path(args[args.index('>')+1]).write_text('') if '>'in args else None
 print('{"error":"device_authorization_required"}');sys.exit(0)
if args[0]=='inspect':print('existing-project');sys.exit(0)
if args[0]=='compose':
 event('compose '+' '.join(args[1:]));sys.exit(0)
if args[0]=='exec':
 if 'equipment-db'in args:event('backup');print('postgres-full-dump');sys.exit(0)
 if '--check'in args or 'JSON.parse'in args[-1]:
  # Actually validate downloaded JS and JSON with Node, using the container command's arguments.
  index=args.index('node');sys.exit(subprocess.run(args[index:],input=sys.stdin.buffer.read()).returncode)
 if 'for(const key'in args[-1]:
  if os.environ['LIVE_KEYS']=='1':print('VAPID_PUBLIC_KEY=preserved-public\\nVAPID_PRIVATE_KEY=preserved-private\\nVAPID_SUBJECT=mailto:old@example.com\\nPUSH_ADMIN_TOKEN=existing-admin')
  sys.exit(0)
 if 'generateVAPIDKeys'in args[-1]:event('generate-keys');print('VAPID_PUBLIC_KEY=new-public\\nVAPID_PRIVATE_KEY=new-private');sys.exit(0)
 if 'fetch('in args[-1]:print('{"ok":true,"deviceWriteVersion":1,"repairVersion":1,"pushReady":true,"reminders":{"enabled":true}}');sys.exit(0)
sys.exit(1)
'''
  for name in ['curl','docker']:
   f=binpath/name;f.write_text(fake);f.chmod(0o755)
  env={**os.environ,'EQUIPMENT_PROJECT_DIR':str(project),'SOURCE_ROOT':str(ROOT),'FAKE_LOG':str(home/'events'),'FAIL_DOWNLOAD':str(int(fail)),'LIVE_KEYS':str(int(keys))}
  result=subprocess.run(['sh',str(project/'run.sh')],env=env,capture_output=True,text=True)
  events=(home/'events').read_text()
  self.assertEqual((project/'docker-compose.yml').read_text(),compose)
  self.assertEqual((project/'.env').read_text(),'DATABASE_PASSWORD=original-secret\n')
  self.assertEqual((project/'data/do-not-touch').read_text(),'actual data')
  self.assertNotIn('original-secret',result.stdout+result.stderr)
  self.assertNotIn('preserved-private',result.stdout+result.stderr)
  self.assertFalse((project/'.equipment-update.lock').exists())
  return result,events,project
 def test_preserves_live_push_keys_and_credentials(self):
  result,events,project=self.run_case()
  self.assertEqual(result.returncode,0,result.stdout+result.stderr)
  self.assertIn('VAPID_PRIVATE_KEY=preserved-private',(project/'equipment-push.env').read_text())
  self.assertNotIn('generate-keys',events)
  self.assertLess(events.index('backup'),events.index(' build api'))
  self.assertIn('--no-deps --force-recreate api gateway',events)
  self.assertEqual((project/'server/server.js').read_bytes(),(ROOT/'server/server.js').read_bytes())
  self.assertTrue(list((project/'backups').glob('*/database.dump')))
 def test_download_failure_never_rebuilds_or_replaces_code(self):
  result,events,project=self.run_case(fail=True)
  self.assertNotEqual(result.returncode,0)
  self.assertNotIn('compose ',events)
  self.assertEqual((project/'server/server.js').read_text(),'old server')
 def test_only_generates_push_keys_when_none_exist(self):
  result,events,project=self.run_case(keys=False)
  self.assertEqual(result.returncode,0,result.stdout+result.stderr)
  self.assertIn('generate-keys',events)
  self.assertIn('VAPID_PRIVATE_KEY=new-private',(project/'equipment-push.env').read_text())
if __name__=='__main__':unittest.main()
