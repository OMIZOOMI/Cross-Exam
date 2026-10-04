/* Task 10D-B only: bounded namespace observations, never a sandbox launcher.
 * Each experiment runs in a disposable child. No host files, mounts, network,
 * policy, identities, or capabilities are elevated or modified. */
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/capability.h>
#include <sched.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/utsname.h>
#include <sys/wait.h>
#include <unistd.h>

static void result(const char *operation, long value, int error) {
  printf("sandbox-diagnostic pid=%d operation=%s result=%ld errno=%d\n", getpid(), operation, value, error);
  fflush(stdout);
}

static void selected_file(const char *name) {
  char value[513];
  int fd = open(name, O_RDONLY | O_CLOEXEC);
  if (fd < 0) { result(name, -1, errno); return; }
  ssize_t count = read(fd, value, sizeof(value) - 1);
  int error = errno;
  close(fd);
  if (count < 0) { result(name, -1, error); return; }
  value[count] = 0;
  for (ssize_t i = 0; i < count; i++)
    if ((unsigned char)value[i] < 32 || (unsigned char)value[i] > 126) value[i] = ' ';
  printf("sandbox-diagnostic file=%s value=%s\n", name, value);
}

static int write_map(const char *name, const char *value) {
  int fd = open(name, O_WRONLY | O_CLOEXEC);
  if (fd < 0) { result(name, -1, errno); return -1; }
  size_t length = strlen(value);
  ssize_t count = write(fd, value, length);
  int error = count < 0 ? errno : (count == (ssize_t)length ? 0 : EIO);
  close(fd);
  result(name, error ? -1 : 0, error);
  return error ? -1 : 0;
}

static void namespace_experiment(int flags, const char *label, int nested) {
  uid_t uid = getuid();
  gid_t gid = getgid();
  fflush(stdout);
  pid_t child = (pid_t)syscall(SYS_clone, flags | SIGCHLD, NULL, NULL, NULL, 0);
  if (child < 0) { result(label, -1, errno); return; }
  if (child == 0) {
    alarm(2);
    result(label, 0, 0);
    selected_file("/proc/self/attr/current");
    if (nested) {
      char map[80];
      if (write_map("/proc/self/setgroups", "deny") < 0) _exit(0);
      snprintf(map, sizeof(map), "%u %u 1\n", gid, gid);
      int gid_result = write_map("/proc/self/gid_map", map);
      snprintf(map, sizeof(map), "%u %u 1\n", uid, uid);
      int uid_result = write_map("/proc/self/uid_map", map);
      if (gid_result < 0 || uid_result < 0) _exit(0);
      struct __user_cap_header_struct header = { _LINUX_CAPABILITY_VERSION_3, 0 };
      struct __user_cap_data_struct data[2] = { {0}, {0} };
      int rc = (int)syscall(SYS_capset, &header, data);
      result("drop-child-caps", rc, rc < 0 ? errno : 0);
      if (rc == 0) {
        rc = unshare(CLONE_NEWUSER);
        result("nested-unshare-NEWUSER", rc, rc < 0 ? errno : 0);
      }
    }
    fflush(stdout);
    _exit(0);
  }
  int status = 0;
  if (waitpid(child, &status, 0) < 0) result("wait-child", -1, errno);
  else result("child-wait-status", status, 0);
}

int main(void) {
  alarm(5);
  /* Keep NNP on even for the outside-service positive control. */
  int rc = prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0);
  result("set-no-new-privileges", rc, rc < 0 ? errno : 0);
  if (rc != 0) return 1;
  struct utsname kernel;
  if (uname(&kernel) == 0)
    printf("sandbox-diagnostic kernel=%s arch=%s uid=%u gid=%u\n", kernel.release, kernel.machine, getuid(), getgid());
  const char *files[] = {
    "/proc/sys/kernel/unprivileged_userns_clone", "/proc/sys/user/max_user_namespaces",
    "/proc/sys/user/max_pid_namespaces", "/proc/sys/user/max_net_namespaces",
    "/proc/sys/kernel/apparmor_restrict_unprivileged_userns",
    "/sys/module/apparmor/parameters/enabled", "/proc/self/attr/current",
    "/proc/self/uid_map", "/proc/self/gid_map"
  };
  for (size_t i = 0; i < sizeof(files)/sizeof(files[0]); i++) selected_file(files[i]);
  FILE *status = fopen("/proc/self/status", "r");
  char line[1024];
  if (status) {
    while (fgets(line, sizeof(line), status))
      if (!strncmp(line, "Uid:", 4) || !strncmp(line, "Gid:", 4) || !strncmp(line, "Groups:", 7) ||
          !strncmp(line, "Cap", 3) || !strncmp(line, "NoNewPrivs:", 11) || !strncmp(line, "Seccomp", 7) || !strncmp(line, "NSpid:", 6))
        printf("sandbox-diagnostic status=%s", line);
    fclose(status);
  }
  FILE *mounts = fopen("/proc/self/mountinfo", "r");
  if (mounts) {
    while (fgets(line, sizeof(line), mounts)) {
      char root[256], destination[256];
      if (sscanf(line, "%*u %*u %*s %255s %255s", root, destination) == 2 && !strcmp(destination, "/"))
        printf("sandbox-diagnostic root-mount-root=%s\n", root);
    }
    fclose(mounts);
  }
  namespace_experiment(CLONE_NEWUSER, "clone-NEWUSER", 1);
  namespace_experiment(CLONE_NEWUSER | CLONE_NEWPID | CLONE_NEWNET, "clone-NEWUSER-NEWPID-NEWNET", 0);
  return 0;
}
