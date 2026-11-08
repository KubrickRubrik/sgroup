import 'profile.dart';
import 'project.dart';

final class BaseConfig {
  // SHA256 JSON без поля snapshot — версия для «принять».
  final String snapshot;
  // id дискорд канала для base.json
  final String dChannel;
  final List<ProfileConfig> profiles;
  final List<ProjectConfig> projects;

  BaseConfig({
    required this.snapshot,
    required this.dChannel,
    required this.profiles,
    required this.projects,
  });

  factory BaseConfig.init() {
    return BaseConfig(
      snapshot: 'snapshot_1',
      dChannel: 'id_дискорд_base_канала',
      profiles: [
        ProfileConfig(
          idMashines: ['id_машины_1'],
          id: 'general',
          title: 'Общий',
          idActiveProject: 'id_project_1',
        ),
        ProfileConfig(
          idMashines: ['id_машины_2'],
          id: 'id_профиля_2',
          title: 'title_профиля_2',
          idActiveProject: 'id_project_1',
        ),
      ],
      projects: [
        ProjectConfig(
          id: 'id_project_1',
          title: 'title_project_1',
          host: 'github',
          repository: 'https://github.com/user/project1',
          dChannels: {'files': 'id_files_discord_channel'},
          profiling: [
            ProfileProfilingConfig(
              id: 'general',
              sidebar: SidebarConfig(bottom: false, left: false, right: true),
              appearance: AppearanceConfig.init(),
            ),
            ProfileProfilingConfig(
              id: 'id_профиля_2',
              githubNick: 'user2',
              repositoryTokenKey: 'opaque_token_ref_2',
              sidebar: SidebarConfig(bottom: false, left: false, right: true),
              appearance: AppearanceConfig.init(),
              reviewSkillPath: '.cursor/review/SKILL.md',
              reviewModel: 'grok',
            ),
          ],
          pages: {
            'map': ProjectPageEntry(name: 'Карта', kind: 'files', order: 1),
          },
        ),
        ProjectConfig(
          id: 'id_project_2',
          title: 'title_project_2',
          host: 'gitlab',
          repository: 'https://gitlab.com/user/project2',
          dChannels: {},
          profiling: [
            ProfileProfilingConfig(
              id: 'general',
              sidebar: SidebarConfig(bottom: false, left: false, right: true),
              appearance: AppearanceConfig.init(),
            ),
          ],
          pages: {},
        ),
      ],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'snapshot': snapshot,
      'dChannel': dChannel,
      'profiles': profiles.map((profile) => profile.toJson()).toList(),
      'projects': projects.map((project) => project.toJson()).toList(),
    };
  }
}
