class TetherTopics {
  TetherTopics(this.serial, {this.namespace = 'tetherlock/v1'});

  final String serial;
  final String namespace;

  String get prefix => '${namespace.replaceFirst(RegExp(r'/+$'), '')}/$serial';
  String get challengeRequest => '$prefix/challenge/request';
  String get challengeResponse => '$prefix/challenge/response';
  String get command => '$prefix/command';
  String get result => '$prefix/result';
  String get state => '$prefix/state';
  String get availability => '$prefix/availability';

  List<String> get subscriptions => [
        challengeResponse,
        result,
        state,
        availability,
      ];
}
